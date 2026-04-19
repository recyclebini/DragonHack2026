import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState, useEffect } from "react";
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
  FUNCTION_WORDS,
} from "@/lib/voice-color";
import type { VoiceFeatures } from "@/lib/voice-color";
import { transcribeFile } from "@/lib/deepgram";
import type { WordTimestamp } from "@/lib/deepgram";

export const Route = createFileRoute("/music")({
  component: MusicPage,
});

type Segment = { time: number; color: string; emotionLabel: string; energy: number; features: VoiceFeatures };

const CHUNK = 0.2;   // seconds per analysis window
const BATCH = 50;    // chunks per setTimeout batch

const FMT = (s: number) =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

function MusicPage() {
  const [segments, setSegments]         = useState<Segment[]>([]);
  const [processing, setProcessing]     = useState(false);
  const [progress, setProgress]         = useState(0);
  const [audioUrl, setAudioUrl]         = useState<string | null>(null);
  const [duration, setDuration]         = useState(0);
  const [currentTime, setCurrentTime]   = useState(0);
  const [dragging, setDragging]         = useState(false);
  const [hoverInfo, setHoverInfo]       = useState<{ x: number; label: string } | null>(null);
  const [transcriptWords, setTranscriptWords] = useState<Array<{
    word: string;
    start: number;
    end: number;
    color: string;
    fontSize: string;
    textTransform: "none" | "uppercase";
  }> | null>(null);
  const [transcriptLoading, setTranscriptLoading] = useState(false);
  const [transcriptError, setTranscriptError]     = useState<string | null>(null);

  const audioRef      = useRef<HTMLAudioElement>(null);
  const ribbonRef     = useRef<HTMLDivElement>(null);
  const actxRef       = useRef<AudioContext | null>(null);
  const activeWordRef = useRef<HTMLSpanElement | null>(null);
  const prevActiveIdx = useRef(-1);

  useEffect(() => () => { actxRef.current?.close(); }, []);

  const activeWordIdx = transcriptWords
    ? transcriptWords.findIndex((w, i) => {
        const nextStart = transcriptWords[i + 1]?.start ?? Infinity;
        return currentTime >= w.start && currentTime < nextStart;
      })
    : -1;

  useEffect(() => {
    if (activeWordIdx !== prevActiveIdx.current && activeWordRef.current) {
      activeWordRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
      prevActiveIdx.current = activeWordIdx;
    }
  }, [activeWordIdx]);

  const MUSIC_CACHE_KEY = "chromavoice.music.v1";

  type MusicCache = { segments: Segment[]; duration: number; transcriptWords: typeof transcriptWords };

  const processFile = async (file: File) => {
    if (!/\.(mp3|wav|ogg|flac|aac|m4a)$/i.test(file.name)) {
      alert("Unsupported format. Please use MP3, WAV, OGG, FLAC, or AAC.");
      return;
    }

    const cacheKey = fileKey(file);
    const cached = getCached<MusicCache>(MUSIC_CACHE_KEY, cacheKey);
    if (cached) {
      setSegments(cached.segments);
      setDuration(cached.duration);
      setAudioUrl(URL.createObjectURL(file));
      if (cached.transcriptWords !== null) {
        setTranscriptWords(cached.transcriptWords);
        return;
      }
      // transcriptWords was null (previous failure) — retry transcription with cached segments
      setTranscriptLoading(true);
      transcribeFile(file)
        .then((words: WordTimestamp[]) => {
          let prevColor = cached.segments[0]?.color ?? "#7a5cff";
          const colored = words.map((w) => {
            const segIdx = Math.max(0, Math.min(Math.floor(w.start / CHUNK), cached.segments.length - 1));
            const seg = cached.segments[segIdx];
            const lower = w.word.toLowerCase().replace(/[^a-z]/g, "");
            if (!seg || FUNCTION_WORDS.has(lower)) {
              return { word: w.word, start: w.start, end: w.end, color: prevColor, fontSize: "1em", textTransform: "none" as const };
            }
            const emo = applyEmotion(seg.color, seg.features);
            const labelMap: Record<string, string> = { Happy: "joy", Sad: "sadness", Intense: "anger", Nervous: "fear", Tender: "surprise", Neutral: "neutral" };
            const emotionKey = labelMap[emo.emotionLabel] ?? "neutral";
            const scores = { joy: 0, sadness: 0, anger: 0, fear: 0, disgust: 0, surprise: 0, neutral: 0, [emotionKey]: 1.0 };
            const wordColor = smoothColor(prevColor, applyEmotionTint(seg.color, scores, 0.30));
            prevColor = wordColor;
            const typo = expressionTypography(emotionKey);
            const fontSize = `${(0.8 + seg.features.energy * 0.55).toFixed(2)}em`;
            return { word: w.word, start: w.start, end: w.end, color: wordColor, fontSize, textTransform: typo.textTransform as "none" | "uppercase" };
          });
          setTranscriptWords(colored);
          setTranscriptLoading(false);
          setCached<MusicCache>(MUSIC_CACHE_KEY, cacheKey, { segments: cached.segments, duration: cached.duration, transcriptWords: colored });
        })
        .catch((err: Error) => {
          setTranscriptError(err.message.includes("VITE_DEEPGRAM_API_KEY") ? "no-key" : "error");
          setTranscriptLoading(false);
        });
      return;
    }

    setProcessing(true);
    setProgress(0);
    setSegments([]);
    setAudioUrl(null);
    setCurrentTime(0);
    setTranscriptWords(null);
    setTranscriptError(null);
    setTranscriptLoading(false);

    const arrayBuffer = await file.arrayBuffer();
    const actx = new AudioContext();
    actxRef.current = actx;
    let decoded: AudioBuffer;
    try {
      decoded = await actx.decodeAudioData(arrayBuffer);
    } catch {
      alert("Could not decode this audio file.");
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
        const endSec   = Math.min(startSec + CHUNK, decoded.duration);
        const features = analyzeSegment(decoded, startSec, endSec);
        const color    = featuresToColor(features);
        const { emotionLabel } = applyEmotion(color, features);
        result.push({ time: startSec, color, emotionLabel, energy: features.energy, features });
      }
      setProgress(Math.round((toChunk / totalChunks) * 100));
      if (toChunk < totalChunks) {
        setTimeout(() => processBatch(toChunk), 0);
      } else {
        setSegments(result);
        setDuration(decoded.duration);
        setProcessing(false);
        setAudioUrl(URL.createObjectURL(file));
        actx.close();
        actxRef.current = null;

        setTranscriptLoading(true);
        transcribeFile(file)
          .then((words: WordTimestamp[]) => {
            let prevColor = result[0]?.color ?? "#7a5cff";
            const colored = words.map((w) => {
              const segIdx = Math.max(0, Math.min(Math.floor(w.start / CHUNK), result.length - 1));
              const seg = result[segIdx];
              const lower = w.word.toLowerCase().replace(/[^a-z]/g, "");
              if (FUNCTION_WORDS.has(lower)) {
                return { word: w.word, start: w.start, end: w.end, color: prevColor, fontSize: "1em", textTransform: "none" as const };
              }
              const emo = applyEmotion(seg.color, seg.features);
              const labelMap: Record<string, string> = { Happy: "joy", Sad: "sadness", Intense: "anger", Nervous: "fear", Tender: "surprise", Neutral: "neutral" };
              const emotionKey = labelMap[emo.emotionLabel] ?? "neutral";
              const scores = { joy: 0, sadness: 0, anger: 0, fear: 0, disgust: 0, surprise: 0, neutral: 0, [emotionKey]: 1.0 };
              const wordColor = smoothColor(prevColor, applyEmotionTint(seg.color, scores, 0.30));
              prevColor = wordColor;
              const typo = expressionTypography(emotionKey);
              // Energy drives font size (0.8em quiet → 1.35em loud); emotion sets uppercase
              const fontSize = `${(0.8 + seg.features.energy * 0.55).toFixed(2)}em`;
              return { word: w.word, start: w.start, end: w.end, color: wordColor, fontSize, textTransform: typo.textTransform as "none" | "uppercase" };
            });
            setTranscriptWords(colored);
            setTranscriptLoading(false);
            setCached<MusicCache>(MUSIC_CACHE_KEY, cacheKey, { segments: result, duration: decoded.duration, transcriptWords: colored });
          })
          .catch((err: Error) => {
            setTranscriptError(err.message.includes("VITE_DEEPGRAM_API_KEY") ? "no-key" : "error");
            setTranscriptLoading(false);
            // Don't cache null transcript — keeps the retry path open on next upload
          });
      }
    };

    processBatch(0);
  };

  const soulHex = segments.length ? groupColor(segments.map((s) => s.color)) : null;
  const playheadPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-5 pt-6 pb-32 md:pb-8">
        <h1 className="font-display text-4xl font-semibold">Music</h1>
        <p className="text-muted-foreground mt-1 mb-8">Upload a track. Every word and note becomes a color — the emotion behind the sound, made visible.</p>

        {/* Upload */}
        {!segments.length && !processing && (
          <label
            className={`flex flex-col items-center justify-center w-full h-48 rounded-2xl glass border-2 border-dashed transition-all cursor-pointer ${dragging ? "border-white/50 bg-white/10" : "border-white/20 hover:border-white/40"}`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) processFile(f); }}
          >
            <p className="font-display text-lg mb-1">Drop audio file here</p>
            <p className="text-sm text-muted-foreground">MP3 · WAV · OGG · FLAC · AAC · M4A</p>
            <input type="file" accept=".mp3,.wav,.ogg,.flac,.aac,.m4a" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) processFile(f); }} />
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
          <div className="space-y-10">
            {/* Color ribbon */}
            <div>
              <h2 className="font-display text-lg mb-2">Color Journey</h2>
              <div
                ref={ribbonRef}
                className="relative w-full h-12 rounded-xl overflow-visible cursor-crosshair"
                onMouseMove={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const pct  = (e.clientX - rect.left) / rect.width;
                  const t    = pct * duration;
                  const idx  = Math.min(Math.floor(t / CHUNK), segments.length - 1);
                  const seg  = segments[idx];
                  if (seg) setHoverInfo({ x: e.clientX - rect.left, label: `${FMT(seg.time)} · ${seg.emotionLabel}` });
                }}
                onMouseLeave={() => setHoverInfo(null)}
              >
                <div className="flex h-12 w-full rounded-xl overflow-hidden">
                  {segments.map((seg, i) => (
                    <div key={i} style={{ background: seg.color, flex: 1, minWidth: 1 }} />
                  ))}
                </div>
                {audioUrl && (
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-white/80 pointer-events-none"
                    style={{ left: `${playheadPct}%` }}
                  />
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

            {/* Transcript */}
            <div>
              <h2 className="font-display text-lg mb-3">Transcript</h2>
              {transcriptLoading && (
                <p className="text-sm text-muted-foreground">Generating transcript…</p>
              )}
              {transcriptError === "no-key" && (
                <div className="glass rounded-xl p-4 text-sm text-muted-foreground">
                  Add a <code className="font-mono text-xs">VITE_DEEPGRAM_API_KEY</code> to enable word-level transcript coloring.
                </div>
              )}
              {transcriptError === "error" && (
                <div className="glass rounded-xl p-4 text-sm text-destructive">
                  Transcript failed. Check your Deepgram API key and try again.
                </div>
              )}
              {transcriptWords !== null && !transcriptLoading && !transcriptError && (
                <div className="glass rounded-xl p-5 leading-relaxed text-base max-h-48 overflow-y-auto">
                  {transcriptWords.map((w, i) => {
                    const isActive = i === activeWordIdx;
                    const prev = transcriptWords[i - 1]?.color ?? w.color;
                    return (
                      <span
                        key={i}
                        ref={isActive ? activeWordRef : undefined}
                        className="transition-all duration-100"
                        style={{
                          background: `linear-gradient(to right, ${prev}, ${w.color})`,
                          WebkitBackgroundClip: "text",
                          WebkitTextFillColor: "transparent",
                          backgroundClip: "text",
                          fontSize: w.fontSize,
                          textTransform: w.textTransform,
                          opacity: isActive ? 1 : 0.6,
                          filter: isActive ? `drop-shadow(0 0 8px ${w.color}88)` : "none",
                        }}
                      >
                        {w.word}{" "}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Soul orb */}
            {soulHex && (
              <div className="flex flex-col sm:flex-row items-center gap-6 glass rounded-2xl p-6">
                <div
                  className="w-24 h-24 rounded-full flex-shrink-0"
                  style={{
                    background: `radial-gradient(circle at 35% 35%, ${soulHex}, color-mix(in oklab, ${soulHex} 30%, black))`,
                    boxShadow: `0 0 60px ${soulHex}66`,
                  }}
                />
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-1">The soul of this track</p>
                  <h3 className="font-display text-2xl font-semibold">{nameForColor(soulHex)}</h3>
                  <p className="font-serif text-lg mt-1 text-foreground/80">"{poemForColor(soulHex)}"</p>
                  <p className="font-mono text-xs mt-2 text-muted-foreground">{soulHex.toUpperCase()}</p>
                </div>
              </div>
            )}

            {/* Playback */}
            {audioUrl && (
              <div>
                <h2 className="font-display text-lg mb-2">Playback</h2>
                <audio
                  ref={audioRef}
                  src={audioUrl}
                  controls
                  className="w-full"
                  onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime ?? 0)}
                />
              </div>
            )}

            <button
              onClick={() => {
                actxRef.current?.close();
                actxRef.current = null;
                setSegments([]);
                setAudioUrl(null);
                setCurrentTime(0);
                setProgress(0);
                setTranscriptWords(null);
                setTranscriptError(null);
                setTranscriptLoading(false);
              }}
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
