import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Upload, Play, Pause, Music2 } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { VoiceBlob } from "@/components/VoiceBlob";
import { Button } from "@/components/ui/button";
import { transcribeFile, type WordTimestamp } from "@/lib/deepgram";
import { segmentColor, analyzeSegment } from "@/lib/audio-analysis";
import { featuresToColor } from "@/lib/voice-color";
import { toast } from "sonner";

export const Route = createFileRoute("/lyrics")({
  head: () => ({
    meta: [
      { title: "Lyrics in Color — Seenesthesia" },
      { name: "description", content: "Upload a song. Watch it become color." },
    ],
  }),
  component: LyricsPage,
});

// ── types ──────────────────────────────────────────────────────────────────────
type Mode = "captions" | "colors";
type Status = "idle" | "loading" | "transcribing" | "ready" | "playing" | "paused";

type ColoredWord = WordTimestamp & { color: string };

// ── helpers ───────────────────────────────────────────────────────────────────
function formatTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

// ── main page ─────────────────────────────────────────────────────────────────
function LyricsPage() {
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<Mode | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [words, setWords] = useState<ColoredWord[]>([]);
  const [currentIdx, setCurrentIdx] = useState(-1);
  const [currentColor, setCurrentColor] = useState("#7a5cff");
  const [currentEnergy, setCurrentEnergy] = useState(0.3);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef(0);
  const offsetRef = useRef(0);
  const isDraggingRef = useRef(false);

  // ── decode audio file ─────────────────────────────────────────────────────
  const decodeFile = useCallback(async (f: File) => {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    audioCtxRef.current = ctx;
    const arrayBuf = await f.arrayBuffer();
    const decoded = await ctx.decodeAudioData(arrayBuf);
    bufferRef.current = decoded;
    setDuration(decoded.duration);
    return decoded;
  }, []);

  // ── pick mode ─────────────────────────────────────────────────────────────
  const pickMode = useCallback(async (m: Mode) => {
    setMode(m);
    if (!file) return;

    setStatus("loading");
    try {
      const decoded = await decodeFile(file);

      if (m === "captions") {
        setStatus("transcribing");
        const raw = await transcribeFile(file);
        const colored: ColoredWord[] = raw.map((w) => ({
          ...w,
          color: segmentColor(decoded, w.start, w.end),
        }));
        setWords(colored);
      }
      setStatus("ready");
    } catch (err) {
      toast.error((err as Error).message ?? "Something went wrong");
      setStatus("idle");
      setMode(null);
    }
  }, [file, decodeFile]);

  // ── playback ──────────────────────────────────────────────────────────────
  const stopSource = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    try { sourceRef.current?.stop(); } catch {}
    sourceRef.current = null;
  }, []);

  const play = useCallback(() => {
    const ctx = audioCtxRef.current!;
    const buf = bufferRef.current!;
    if (ctx.state === "suspended") ctx.resume();

    const source = ctx.createBufferSource();
    source.buffer = buf;

    if (mode === "colors") {
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      analyser.connect(ctx.destination);
      analyserRef.current = analyser;
    } else {
      source.connect(ctx.destination);
    }

    source.start(0, offsetRef.current);
    startTimeRef.current = ctx.currentTime - offsetRef.current;
    sourceRef.current = source;
    source.onended = () => {
      if (status === "playing") { offsetRef.current = 0; setStatus("ready"); setCurrentIdx(-1); setProgress(0); }
    };
    setStatus("playing");

    const freqData = new Uint8Array(analyserRef.current?.frequencyBinCount ?? 0);
    const timeData = new Float32Array(analyserRef.current?.fftSize ?? 0);

    const loop = () => {
      const elapsed = ctx.currentTime - startTimeRef.current;
      setProgress(elapsed);

      if (mode === "captions") {
        let idx = -1;
        for (let i = 0; i < words.length; i++) {
          if (words[i].start <= elapsed) idx = i;
          else break;
        }
        setCurrentIdx(idx);
      } else if (mode === "colors" && analyserRef.current) {
        analyserRef.current.getByteFrequencyData(freqData);
        analyserRef.current.getFloatTimeDomainData(timeData);

        let sum = 0;
        for (let i = 0; i < timeData.length; i++) sum += timeData[i] * timeData[i];
        const energy = Math.min(1, Math.sqrt(sum / timeData.length) * 6);

        let num = 0, den = 0;
        for (let i = 0; i < freqData.length; i++) { num += i * freqData[i]; den += freqData[i]; }
        const nyquist = ctx.sampleRate / 2;
        const centroidHz = den > 0 ? (num / den / freqData.length) * nyquist : 500;
        const brightness = Math.min(1, Math.max(0, (centroidHz - 500) / (4000 - 500)));

        const features = analyzeSegment(bufferRef.current!, Math.max(0, elapsed - 0.1), elapsed + 0.05);
        setCurrentColor(featuresToColor({ ...features, brightness, energy }));
        setCurrentEnergy(energy);
      }

      rafRef.current = requestAnimationFrame(loop);
    };
    loop();
  }, [mode, words, status]);

  const pause = useCallback(() => {
    const ctx = audioCtxRef.current!;
    offsetRef.current = ctx.currentTime - startTimeRef.current;
    stopSource();
    setStatus("paused");
  }, [stopSource]);

  const togglePlay = useCallback(() => {
    if (status === "playing") pause();
    else play();
  }, [status, play, pause]);

  // ── cleanup ────────────────────────────────────────────────────────────────
  useEffect(() => () => {
    stopSource();
    audioCtxRef.current?.close().catch(() => {});
  }, [stopSource]);

  // ── reset when new file picked ─────────────────────────────────────────────
  const handleFile = (f: File) => {
    stopSource();
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    bufferRef.current = null;
    offsetRef.current = 0;
    setFile(f);
    setMode(null);
    setStatus("idle");
    setWords([]);
    setCurrentIdx(-1);
    setProgress(0);
    setCurrentColor("#7a5cff");
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    isDraggingRef.current = false;
    const f = e.dataTransfer.files[0];
    if (f?.type.startsWith("audio/")) handleFile(f);
    else toast.error("Please drop an audio file");
  };

  const statusLabel: Record<Status, string> = {
    idle: "",
    loading: "Decoding audio…",
    transcribing: "Isolating vocals + transcribing…",
    ready: "",
    playing: "",
    paused: "",
  };

  const isProcessing = status === "loading" || status === "transcribing";

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-5 pt-6 pb-24">

        {/* Header */}
        <header className="mb-8">
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Accessibility · Synesthesia</p>
          <h1 className="font-display text-4xl md:text-5xl font-semibold mt-2">Lyrics in color</h1>
          <p className="font-serif text-xl text-muted-foreground mt-2">
            Upload a song. Watch it become color.
          </p>
        </header>

        {/* Upload zone — always visible, smaller once file loaded */}
        {!file ? (
          <div
            onDrop={onDrop}
            onDragOver={(e) => { e.preventDefault(); isDraggingRef.current = true; }}
            onDragLeave={() => { isDraggingRef.current = false; }}
            className="glass rounded-3xl border-2 border-dashed border-white/20 flex flex-col items-center justify-center gap-4 py-20 cursor-pointer hover:border-white/40 transition"
            onClick={() => document.getElementById("audio-input")?.click()}
          >
            <Upload className="size-10 text-muted-foreground" />
            <div className="text-center">
              <p className="font-medium">Drop an audio file here</p>
              <p className="text-sm text-muted-foreground mt-1">MP3, WAV, M4A — anything your browser can play</p>
            </div>
            <input
              id="audio-input"
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
          </div>
        ) : (
          /* File loaded — compact strip */
          <div
            className="glass rounded-2xl px-5 py-3 flex items-center gap-3 mb-6 cursor-pointer hover:bg-white/5 transition"
            onClick={() => document.getElementById("audio-input")?.click()}
          >
            <Music2 className="size-4 text-muted-foreground flex-shrink-0" />
            <span className="text-sm font-medium truncate flex-1">{file.name}</span>
            <span className="text-xs text-muted-foreground">Change</span>
            <input
              id="audio-input"
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
          </div>
        )}

        {/* Mode selection */}
        {file && !mode && !isProcessing && (
          <div className="flex flex-col items-center gap-6 mt-12 animate-fade-up">
            <p className="text-sm text-muted-foreground">How do you want to experience it?</p>
            <div className="grid grid-cols-2 gap-4 w-full max-w-md">
              <button
                onClick={() => pickMode("captions")}
                className="glass rounded-2xl p-6 flex flex-col items-center gap-3 hover:bg-white/10 transition group"
              >
                <span className="text-3xl">✦</span>
                <span className="font-display font-semibold">Captions</span>
                <span className="text-xs text-muted-foreground text-center">Words appear colored by the voice singing them</span>
              </button>
              <button
                onClick={() => pickMode("colors")}
                className="glass rounded-2xl p-6 flex flex-col items-center gap-3 hover:bg-white/10 transition group"
              >
                <span className="text-3xl">◉</span>
                <span className="font-display font-semibold">Colors only</span>
                <span className="text-xs text-muted-foreground text-center">Pure color — no text, just the feeling</span>
              </button>
            </div>
          </div>
        )}

        {/* Processing state */}
        {isProcessing && (
          <div className="flex flex-col items-center gap-3 mt-16 animate-fade-up">
            <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white animate-spin" />
            <p className="text-sm text-muted-foreground">{statusLabel[status]}</p>
          </div>
        )}

        {/* ── CAPTIONS MODE ─────────────────────────────────────────────────── */}
        {mode === "captions" && (status === "ready" || status === "playing" || status === "paused") && (
          <CaptionsPlayer
            words={words}
            currentIdx={currentIdx}
            status={status}
            progress={progress}
            duration={duration}
            onToggle={togglePlay}
          />
        )}

        {/* ── COLORS MODE ───────────────────────────────────────────────────── */}
        {mode === "colors" && (status === "ready" || status === "playing" || status === "paused") && (
          <ColorsPlayer
            color={currentColor}
            energy={currentEnergy}
            status={status}
            progress={progress}
            duration={duration}
            onToggle={togglePlay}
          />
        )}

        {/* Accessibility note */}
        <div className="mt-12 glass rounded-2xl p-6 max-w-xl">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-2">Greater Good</p>
          <p className="font-serif text-lg leading-relaxed text-foreground/80">
            "For those who are deaf or hard of hearing — every voice has a color.
            Music doesn't have to be heard to be felt."
          </p>
        </div>
      </main>
    </div>
  );
}

// ── Captions player ────────────────────────────────────────────────────────────
function CaptionsPlayer({
  words, currentIdx, status, progress, duration, onToggle,
}: {
  words: ColoredWord[];
  currentIdx: number;
  status: Status;
  progress: number;
  duration: number;
  onToggle: () => void;
}) {
  const currentRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    currentRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [currentIdx]);

  return (
    <div className="mt-6 animate-fade-up flex flex-col gap-4">
      {/* Playback bar */}
      <PlaybackBar status={status} progress={progress} duration={duration} onToggle={onToggle} />

      {/* Words */}
      <div className="glass rounded-3xl p-8 min-h-[320px] overflow-y-auto max-h-[520px]">
        <p className="font-serif text-2xl leading-loose">
          {words.map((w, i) => {
            const isCurrent = i === currentIdx;
            const isPast = i < currentIdx;
            return (
              <span
                key={i}
                ref={isCurrent ? currentRef : null}
                className="inline transition-all duration-150"
                style={{
                  color: w.color,
                  opacity: isCurrent ? 1 : isPast ? 0.55 : 0.25,
                  textShadow: isCurrent ? `0 0 24px ${w.color}, 0 0 48px ${w.color}88` : "none",
                  fontSize: isCurrent ? "1.35em" : "1em",
                  marginRight: "0.35em",
                  display: "inline-block",
                  transform: isCurrent ? "scale(1.08)" : "scale(1)",
                }}
              >
                {w.word}
              </span>
            );
          })}
        </p>
      </div>
    </div>
  );
}

// ── Colors player ──────────────────────────────────────────────────────────────
function ColorsPlayer({
  color, energy, status, progress, duration, onToggle,
}: {
  color: string;
  energy: number;
  status: Status;
  progress: number;
  duration: number;
  onToggle: () => void;
}) {
  return (
    <div className="mt-6 animate-fade-up flex flex-col gap-4">
      <PlaybackBar status={status} progress={progress} duration={duration} onToggle={onToggle} />

      {/* Color experience */}
      <div
        className="relative glass rounded-3xl overflow-hidden flex items-center justify-center"
        style={{
          height: 480,
          background: `radial-gradient(circle at 50% 50%, ${color}22 0%, ${color}08 50%, transparent 80%)`,
          transition: "background 0.3s ease",
        }}
      >
        {/* Outer glow ring */}
        <div
          className="absolute inset-0 rounded-3xl pointer-events-none"
          style={{
            boxShadow: `inset 0 0 120px ${color}33`,
            transition: "box-shadow 0.3s ease",
          }}
        />
        <VoiceBlob color={color} energy={status === "playing" ? energy : 0.15} size={280} />
        {status !== "playing" && (
          <div className="absolute inset-0 flex items-center justify-center">
            <button
              onClick={onToggle}
              className="w-16 h-16 rounded-full flex items-center justify-center glass hover:bg-white/10 transition"
              style={{ boxShadow: `0 0 40px ${color}66` }}
            >
              <Play className="size-6 ml-1" style={{ color }} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Shared playback bar ────────────────────────────────────────────────────────
function PlaybackBar({
  status, progress, duration, onToggle,
}: {
  status: Status;
  progress: number;
  duration: number;
  onToggle: () => void;
}) {
  const pct = duration > 0 ? (progress / duration) * 100 : 0;
  return (
    <div className="glass rounded-2xl px-5 py-3 flex items-center gap-4">
      <button onClick={onToggle} className="flex-shrink-0">
        {status === "playing"
          ? <Pause className="size-5" />
          : <Play className="size-5 ml-0.5" />}
      </button>
      <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-100"
          style={{ width: `${pct}%`, background: "oklch(0.78 0.18 320)" }}
        />
      </div>
      <span className="text-xs tabular-nums text-muted-foreground flex-shrink-0">
        {formatTime(progress)} / {formatTime(duration)}
      </span>
    </div>
  );
}
