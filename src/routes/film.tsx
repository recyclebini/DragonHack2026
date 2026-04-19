import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import chroma from "chroma-js";
import { SiteHeader } from "@/components/SiteHeader";
import { analyzeSegment } from "@/lib/audio-analysis";
import { fileKey, getCached, setCached } from "@/lib/audio-cache";
import {
  featuresToColor,
  applyEmotion,
  groupColor,
  nameForColor,
  poemForColor,
  applyEmotionTint,
  smoothColor,
  expressionTypography,
  identityColor,
  FUNCTION_WORDS,
} from "@/lib/voice-color";
import type { VoiceFeatures } from "@/lib/voice-color";
import { transcribeFile } from "@/lib/deepgram";
import type { WordTimestamp } from "@/lib/deepgram";

export const Route = createFileRoute("/film")({
  component: FilmPage,
});

type Segment = { time: number; color: string; emotionLabel: string; features: VoiceFeatures };
type ColoredWord = {
  word: string;
  start: number;
  end: number;
  color: string;
  fontSize: string;
  textTransform: "none" | "uppercase";
};

const CHUNK = 0.2;
const BATCH = 50;
const FMT = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

function FilmPage() {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [hoverInfo, setHoverInfo] = useState<{ x: number; label: string } | null>(null);
  const [transcriptWords, setTranscriptWords] = useState<ColoredWord[] | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const ribbonRef = useRef<HTMLDivElement>(null);
  const actxRef = useRef<AudioContext | null>(null);

  useEffect(() => () => { actxRef.current?.close(); }, []);

  const FILM_CACHE_KEY = "chromavoice.film.v1";

  type FilmCache = { segments: Segment[]; duration: number; transcriptWords: ColoredWord[] | null };

  const processFile = async (file: File) => {
    if (!/\.(mp4|webm|mov|mkv)$/i.test(file.name)) {
      alert("Unsupported format. Please use MP4, WebM, MOV, or MKV.");
      return;
    }

    const cacheKey = fileKey(file);
    const cached = getCached<FilmCache>(FILM_CACHE_KEY, cacheKey);
    if (cached) {
      setSegments(cached.segments);
      setDuration(cached.duration);
      setVideoUrl(URL.createObjectURL(file));
      setTranscriptWords(cached.transcriptWords);
      return;
    }

    setProcessing(true);
    setProgress(0);
    setSegments([]);
    setVideoUrl(null);
    setCurrentTime(0);
    setTranscriptWords(null);

    const arrayBuffer = await file.arrayBuffer();
    const actx = new AudioContext();
    actxRef.current = actx;
    let decoded: AudioBuffer;
    try {
      decoded = await actx.decodeAudioData(arrayBuffer);
    } catch {
      alert("Could not decode audio from this video file.");
      setProcessing(false);
      await actx.close();
      return;
    }

    const totalChunks = Math.ceil(decoded.duration / CHUNK);
    const result: Segment[] = [];

    const processBatch = (fromChunk: number) => {
      const toChunk = Math.min(fromChunk + BATCH, totalChunks);
      for (let i = fromChunk; i < toChunk; i++) {
        const startSec = i * CHUNK;
        const endSec = Math.min(startSec + CHUNK, decoded.duration);
        const features = analyzeSegment(decoded, startSec, endSec);
        const color = featuresToColor(features);
        const { emotionLabel } = applyEmotion(color, features);
        result.push({ time: startSec, color, emotionLabel, features });
      }
      setProgress(Math.round((toChunk / totalChunks) * 100));
      if (toChunk < totalChunks) {
        setTimeout(() => processBatch(toChunk), 0);
      } else {
        setSegments(result);
        setDuration(decoded.duration);
        setProcessing(false);
        setVideoUrl(URL.createObjectURL(file));
        actx.close();
        actxRef.current = null;

        transcribeFile(file)
          .then((words: WordTimestamp[]) => {
            // One scene-wide identity color, then rotate hue per speaker index.
            // Acoustic features can't distinguish speakers in mixed audio, so we use
            // index-based hue offsets (evenly spaced) to guarantee visual distinction.
            const avgPitch = result.reduce((s, seg) => s + seg.features.pitch, 0) / result.length;
            const avgBrightness = result.reduce((s, seg) => s + seg.features.brightness, 0) / result.length;
            const sceneIdentity = identityColor({ pitch: avgPitch, brightness: avgBrightness, energy: 0, hnr: 0.5 });

            const speakerIdxSet = new Set(words.map((w) => w.speaker ?? 0));
            const speakerList = [...speakerIdxSet].sort((a, b) => a - b);
            const speakerColors = new Map<number, string>();
            speakerList.forEach((spk, i) => {
              const [h, s, l] = chroma(sceneIdentity).hsl();
              const hue = ((isNaN(h) ? 0 : h) + i * (360 / Math.max(speakerList.length, 2))) % 360;
              speakerColors.set(spk, chroma.hsl(hue, isNaN(s) ? 0.65 : s, isNaN(l) ? 0.5 : l).hex());
            });

            let prevColor = result[0]?.color ?? "#7a5cff";
            const colored: ColoredWord[] = words.map((w) => {
              const segIdx = Math.max(0, Math.min(Math.floor(w.start / CHUNK), result.length - 1));
              const seg = result[segIdx];
              const lower = w.word.toLowerCase().replace(/[^a-z]/g, "");
              if (FUNCTION_WORDS.has(lower)) {
                return { word: w.word, start: w.start, end: w.end, color: prevColor, fontSize: "1em", textTransform: "none" as const };
              }
              const spkBase = speakerColors.get(w.speaker ?? 0) ?? seg.color;
              const emo = applyEmotion(seg.color, seg.features);
              const labelMap: Record<string, string> = { Happy: "joy", Sad: "sadness", Intense: "anger", Nervous: "fear", Tender: "surprise", Neutral: "neutral" };
              const emotionKey = labelMap[emo.emotionLabel] ?? "neutral";
              const scores = { joy: 0, sadness: 0, anger: 0, fear: 0, disgust: 0, surprise: 0, neutral: 0, [emotionKey]: 1.0 };
              const wordColor = smoothColor(prevColor, applyEmotionTint(spkBase, scores, 0.45));
              prevColor = wordColor;
              const typo = expressionTypography(emotionKey);
              // Energy drives font size (0.8em quiet → 1.35em loud); emotion sets uppercase
              const fontSize = `${(0.8 + seg.features.energy * 0.55).toFixed(2)}em`;
              return { word: w.word, start: w.start, end: w.end, color: wordColor, fontSize, textTransform: typo.textTransform as "none" | "uppercase" };
            });
            setTranscriptWords(colored);
            setCached<FilmCache>(FILM_CACHE_KEY, cacheKey, { segments: result, duration: decoded.duration, transcriptWords: colored });
          })
          .catch(() => {
            setCached<FilmCache>(FILM_CACHE_KEY, cacheKey, { segments: result, duration: decoded.duration, transcriptWords: null });
          });
      }
    };

    processBatch(0);
  };

  // Average only the top-energy segments — silent/background segments dominate and wash out the mean
  const soulHex = segments.length ? (() => {
    const sorted = [...segments].sort((a, b) => a.features.energy - b.features.energy);
    const active = sorted.slice(Math.floor(sorted.length * 0.6)); // top 40% by energy
    return groupColor(active.map((s) => s.color));
  })() : null;
  const playheadPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  // Words visible in the subtitle window: ±3 seconds around currentTime
  const subtitleWords = transcriptWords
    ? transcriptWords.filter((w) => w.start >= currentTime - 0.5 && w.start <= currentTime + 4)
    : [];

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-5 pt-6 pb-32 md:pb-8">
        <h1 className="font-display text-4xl font-semibold">Film</h1>
        <p className="text-muted-foreground mt-1 mb-8">Upload a film or video. Every spoken word appears in the color of the emotion behind it — subtitles that carry tone, not just text.</p>

        {/* Upload */}
        {!segments.length && !processing && (
          <label
            className={`flex flex-col items-center justify-center w-full h-48 rounded-2xl glass border-2 border-dashed transition-all cursor-pointer ${dragging ? "border-white/50 bg-white/10" : "border-white/20 hover:border-white/40"}`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) processFile(f); }}
          >
            <p className="font-display text-lg mb-1">Drop video file here</p>
            <p className="text-sm text-muted-foreground">MP4 · WebM · MOV · MKV</p>
            <input type="file" accept=".mp4,.webm,.mov,.mkv" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) processFile(f); }} />
          </label>
        )}

        {/* Progress */}
        {processing && (
          <div className="flex flex-col items-center gap-4 py-12">
            <p className="text-sm text-muted-foreground">Analyzing… {progress}%</p>
            <div className="w-full max-w-sm h-2 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        {/* Results */}
        {!!segments.length && (
          <div className="space-y-8">
            {/* Video player */}
            {videoUrl && (
              <div className="space-y-3">
                <video
                  ref={videoRef}
                  src={videoUrl}
                  controls
                  className="w-full rounded-2xl"
                  style={{ maxHeight: "min(420px, 56vw)" }}
                  onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime ?? 0)}
                />
                {/* Subtitle panel */}
                <div className="glass rounded-2xl px-6 py-4 min-h-[64px] flex items-center justify-center text-center">
                  {subtitleWords.length > 0 ? (
                    <p className="text-xl leading-relaxed">
                      {subtitleWords.map((w, i) => {
                        const isActive = currentTime >= w.start && currentTime < (subtitleWords[i + 1]?.start ?? Infinity);
                        const prev = subtitleWords[i - 1]?.color ?? w.color;
                        return (
                          <span
                            key={`${w.start}-${i}`}
                            className="transition-all duration-150"
                            style={{
                              background: `linear-gradient(to right, ${prev}, ${w.color})`,
                              WebkitBackgroundClip: "text",
                              WebkitTextFillColor: "transparent",
                              backgroundClip: "text",
                              textTransform: w.textTransform,
                              fontSize: isActive ? `calc(${w.fontSize} * 1.18)` : w.fontSize,
                              opacity: isActive ? 1 : 0.55,
                              filter: isActive ? `drop-shadow(0 0 8px ${w.color}99)` : "none",
                            }}
                          >
                            {w.word}{" "}
                          </span>
                        );
                      })}
                    </p>
                  ) : (
                    <p className="text-muted-foreground text-sm">
                      {transcriptWords ? "No speech here" : "Play the video to see subtitles"}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Color ribbon */}
            <div>
              <h2 className="font-display text-lg mb-2">Color Journey</h2>
              <div
                ref={ribbonRef}
                className="relative w-full h-12 rounded-xl overflow-visible cursor-crosshair"
                onMouseMove={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const pct = (e.clientX - rect.left) / rect.width;
                  const t = pct * duration;
                  const idx = Math.min(Math.floor(t / CHUNK), segments.length - 1);
                  const seg = segments[idx];
                  if (seg) setHoverInfo({ x: e.clientX - rect.left, label: `${FMT(seg.time)} · ${seg.emotionLabel}` });
                }}
                onMouseLeave={() => setHoverInfo(null)}
              >
                <div className="flex h-12 w-full rounded-xl overflow-hidden">
                  {segments.map((seg, i) => (
                    <div key={i} style={{ background: seg.color, flex: 1, minWidth: 1 }} />
                  ))}
                </div>
                {videoUrl && (
                  <div className="absolute top-0 bottom-0 w-0.5 bg-white/80 pointer-events-none" style={{ left: `${playheadPct}%` }} />
                )}
                {hoverInfo && (
                  <div
                    className="absolute top-full mt-1 px-2 py-1 text-xs glass rounded pointer-events-none whitespace-nowrap z-10"
                    style={{ left: Math.min(hoverInfo.x, (ribbonRef.current?.clientWidth ?? 400) - 140) }}
                  >
                    {hoverInfo.label}
                  </div>
                )}
              </div>
            </div>

            {/* Soul orb */}
            {soulHex && (
              <div className="flex flex-col sm:flex-row items-center gap-6 glass rounded-2xl p-6">
                <div className="w-24 h-24 rounded-full flex-shrink-0" style={{ background: `radial-gradient(circle at 35% 35%, ${soulHex}, color-mix(in oklab, ${soulHex} 30%, black))`, boxShadow: `0 0 60px ${soulHex}66` }} />
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-1">The soul of this film</p>
                  <h3 className="font-display text-2xl font-semibold">{nameForColor(soulHex)}</h3>
                  <p className="font-serif text-lg mt-1 text-foreground/80">"{poemForColor(soulHex)}"</p>
                  <p className="font-mono text-xs mt-2 text-muted-foreground">{soulHex.toUpperCase()}</p>
                </div>
              </div>
            )}

            <button
              onClick={() => { actxRef.current?.close(); actxRef.current = null; setSegments([]); setVideoUrl(null); setCurrentTime(0); setProgress(0); setTranscriptWords(null); }}
              className="text-sm text-muted-foreground hover:text-foreground transition"
            >
              ← Try another file
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
