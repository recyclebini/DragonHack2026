import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState, useEffect } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { analyzeSegment } from "@/lib/audio-analysis";
import { featuresToColor, applyEmotion, groupColor, nameForColor, poemForColor } from "@/lib/voice-color";

export const Route = createFileRoute("/music")({
  component: MusicPage,
});

type Segment = { time: number; color: string; emotionLabel: string; energy: number };

const CHUNK = 0.2;   // seconds per analysis window
const BATCH = 50;    // chunks per setTimeout batch

const FMT = (s: number) =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

function MusicPage() {
  const [segments, setSegments]     = useState<Segment[]>([]);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress]     = useState(0);
  const [audioUrl, setAudioUrl]     = useState<string | null>(null);
  const [duration, setDuration]     = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [dragging, setDragging]     = useState(false);
  const [hoverInfo, setHoverInfo]   = useState<{ x: number; label: string } | null>(null);
  const audioRef   = useRef<HTMLAudioElement>(null);
  const ribbonRef  = useRef<HTMLDivElement>(null);
  const actxRef    = useRef<AudioContext | null>(null);

  useEffect(() => () => { actxRef.current?.close(); }, []);

  const processFile = async (file: File) => {
    if (!/\.(mp3|wav|ogg|flac|aac|m4a)$/i.test(file.name)) {
      alert("Unsupported format. Please use MP3, WAV, OGG, FLAC, or AAC.");
      return;
    }
    setProcessing(true);
    setProgress(0);
    setSegments([]);
    setAudioUrl(null);
    setCurrentTime(0);

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
        result.push({ time: startSec, color, emotionLabel, energy: features.energy });
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
      }
    };

    processBatch(0);
  };

  const emotionArc = () => {
    if (!segments.length) return [];
    const BLOCK = 10;
    return Array.from({ length: Math.ceil(duration / BLOCK) }, (_, b) => {
      const start = b * BLOCK;
      const end   = Math.min(start + BLOCK, duration);
      const counts: Record<string, number> = {};
      segments
        .filter((s) => s.time >= start && s.time < end)
        .forEach((s) => { counts[s.emotionLabel] = (counts[s.emotionLabel] ?? 0) + 1; });
      const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Neutral";
      return { start, end, dominant };
    });
  };

  const soulHex = segments.length ? groupColor(segments.map((s) => s.color)) : null;
  const playheadPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 pt-6 pb-32 md:pb-8">
        <h1 className="font-display text-3xl font-semibold mb-2">Music</h1>
        <p className="text-muted-foreground mb-8 text-sm">Upload a track to see its emotional color journey.</p>

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

            {/* Energy bars */}
            <div>
              <h2 className="font-display text-lg mb-2">Energy</h2>
              <div className="flex items-end h-16 w-full gap-px rounded-xl overflow-hidden">
                {segments.map((seg, i) => (
                  <div
                    key={i}
                    style={{ height: `${Math.max(4, seg.energy * 100)}%`, background: seg.color, flex: 1, minWidth: 1 }}
                  />
                ))}
              </div>
            </div>

            {/* Emotion arc */}
            <div>
              <h2 className="font-display text-lg mb-3">Emotion Arc</h2>
              <div className="space-y-1.5">
                {emotionArc().map((block, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm">
                    <span className="font-mono text-muted-foreground text-xs w-24 shrink-0">
                      {FMT(block.start)}–{FMT(block.end)}
                    </span>
                    <span className="font-serif italic">{block.dominant}</span>
                  </div>
                ))}
              </div>
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
              onClick={() => { actxRef.current?.close(); actxRef.current = null; setSegments([]); setAudioUrl(null); setCurrentTime(0); setProgress(0); }}
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
