import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import chroma from "chroma-js";
import { useVoiceAnalyzer } from "@/hooks/use-voice-analyzer";
import { applyEmotion, type VoiceFeatures } from "@/lib/voice-color";

export const Route = createFileRoute("/visualize")({
  component: VisualizePage,
});

type Ring = { x: number; y: number; maxR: number; color: string; startTime: number };
const BASE_COLOR = "#7a5cff";
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const DB_FLOOR = -50;
const DB_CEIL = 0;

function VisualizePage() {
  const [mode, setMode] = useState<"loudness" | "pitch">("loudness");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { state, start, stop, color, features, loudness } = useVoiceAnalyzer({
    loudnessOnly: mode === "loudness",
  });

  const dbfsRef = useRef(-100);
  const rmsRef = useRef(0);
  const colorRef = useRef(BASE_COLOR);
  const featuresRef = useRef<VoiceFeatures>({
    pitch: 150,
    brightness: 0.5,
    energy: 0,
    hnr: 0.5,
  });
  const ringsRef = useRef<Ring[]>([]);
  const prevEnergyRef = useRef(0);
  const loudnessRef = useRef(0);
  const lastRingAtRef = useRef(0);
  const melodyRef = useRef<number[]>([]);
  const pitchHistoryRef = useRef<number[]>([]);
  const renderColorRef = useRef<string>(BASE_COLOR);

  useEffect(() => {
    dbfsRef.current = Math.max(-100, Math.min(0, loudness.dbfs));
    rmsRef.current = Math.max(0, Math.min(1, loudness.rms));
  }, [loudness]);

  useEffect(() => {
    colorRef.current = color || BASE_COLOR;
    if (!renderColorRef.current) renderColorRef.current = color || BASE_COLOR;
  }, [color]);

  useEffect(() => {
    featuresRef.current = features;
  }, [features]);

  // Canvas draw loop — runs once, reads from refs every frame
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const ctx = canvas.getContext("2d")!;
    let raf = 0;

    const draw = (timestamp: number) => {
      const w = canvas.width;
      const h = canvas.height;
      const voiceColor = colorRef.current || BASE_COLOR;

      if (mode === "pitch") {
        const f = featuresRef.current;

        try {
          renderColorRef.current = chroma
            .mix(renderColorRef.current, voiceColor, 0.03, "lab")
            .hex();
        } catch {
          renderColorRef.current = voiceColor;
        }
        const renderColor = renderColorRef.current;

        ctx.globalAlpha = 0.02;
        ctx.fillStyle = renderColor;
        ctx.fillRect(0, 0, w, h);
        ctx.globalAlpha = 1;

        // Side-scrolling melody line driven by pitch (original behavior).
        const pitchNorm = clamp01(((f.pitch || 150) - 60) / (800 - 60));
        pitchHistoryRef.current.push(pitchNorm);
        if (pitchHistoryRef.current.length > 10) pitchHistoryRef.current.shift();
        const avgPitch =
          pitchHistoryRef.current.reduce((a, b) => a + b, 0) / pitchHistoryRef.current.length;
        const targetY = h * (0.85 - avgPitch * 0.7);

        melodyRef.current.push(targetY);
        if (melodyRef.current.length > w) melodyRef.current.shift();

        const pts = melodyRef.current;
        if (pts.length > 1) {
          ctx.beginPath();
          const startX = Math.max(0, w - pts.length);
          ctx.moveTo(startX, pts[0]);
          for (let i = 1; i < pts.length - 1; i++) {
            const cpX = startX + i;
            const cpY = pts[i];
            const nextX = startX + i + 0.5;
            const nextY = (pts[i] + pts[i + 1]) / 2;
            ctx.quadraticCurveTo(cpX, cpY, nextX, nextY);
          }
          ctx.lineTo(startX + pts.length - 1, pts[pts.length - 1]);
          ctx.strokeStyle = renderColor;
          ctx.lineWidth = 1.5;
          ctx.globalAlpha = 0.6;
          ctx.stroke();
          ctx.globalAlpha = 1;
        }

        const delta = Math.abs(f.energy - prevEnergyRef.current);
        if (delta > 0.4 && ringsRef.current.length < 2) {
          ringsRef.current.push({
            x: w / 2,
            y: h / 2,
            maxR: Math.min(w, h) * 0.4,
            color: renderColor,
            startTime: timestamp,
          });
        }
        prevEnergyRef.current = f.energy;

        ringsRef.current = ringsRef.current.filter((ring) => {
          const age = timestamp - ring.startTime;
          if (age > 1500) return false;
          const t = age / 1500;
          const r = 10 + (ring.maxR - 10) * t;
          ctx.beginPath();
          ctx.arc(ring.x, ring.y, r, 0, Math.PI * 2);
          ctx.strokeStyle = ring.color;
          ctx.lineWidth = 2;
          ctx.globalAlpha = (1 - t) * 0.4;
          ctx.stroke();
          ctx.globalAlpha = 1;
          return true;
        });
      } else {
        const dbfs = dbfsRef.current;

        // Direct mapping from raw dBFS meter to 0..1 intensity.
        // -50 dBFS => 0, 0 dBFS => 1, no adaptive normalization/smoothing.
        const loudness = clamp01((dbfs - DB_FLOOR) / (DB_CEIL - DB_FLOOR));
        loudnessRef.current = loudness;

        const hotColor = chroma.mix(voiceColor, "#ffffff", 0.06 + loudness * 0.72, "lab").hex();

        // Slow background fade toward rendered color
        ctx.globalAlpha = 0.015 + loudness * 0.12;
        ctx.fillStyle = hotColor;
        ctx.fillRect(0, 0, w, h);
        ctx.globalAlpha = 1;

        // Center glow pulse for immediate loudness feedback.
        const pulseR = 18 + loudness * Math.min(w, h) * 0.12;
        const pulseGrad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, pulseR);
        pulseGrad.addColorStop(
          0,
          chroma(hotColor)
            .alpha(0.22 + loudness * 0.4)
            .css(),
        );
        pulseGrad.addColorStop(1, chroma(hotColor).alpha(0).css());
        ctx.fillStyle = pulseGrad;
        ctx.beginPath();
        ctx.arc(w / 2, h / 2, pulseR, 0, Math.PI * 2);
        ctx.fill();

        // Loudness spike or sustained loudness -> ring.
        const delta = Math.abs(loudness - prevEnergyRef.current);
        const enoughTimeSinceLastRing = timestamp - lastRingAtRef.current > 180;
        const triggerRing = delta > 0.04 || loudness > 0.22;
        if (triggerRing && enoughTimeSinceLastRing && ringsRef.current.length < 6) {
          ringsRef.current.push({
            x: w / 2,
            y: h / 2,
            maxR: Math.min(w, h) * (0.18 + loudness * 0.5),
            color: hotColor,
            startTime: timestamp,
          });
          lastRingAtRef.current = timestamp;
        }
        prevEnergyRef.current = loudness;

        // Rings — expand and fade over 1200ms
        ringsRef.current = ringsRef.current.filter((ring) => {
          const age = timestamp - ring.startTime;
          if (age > 1200) return false;
          const t = age / 1200;
          const r = 10 + (ring.maxR - 10) * t;
          ctx.beginPath();
          ctx.arc(ring.x, ring.y, r, 0, Math.PI * 2);
          ctx.strokeStyle = ring.color;
          ctx.lineWidth = 2 + loudness * 2.2;
          ctx.globalAlpha = (1 - t) * (0.25 + loudness * 0.35);
          ctx.stroke();
          ctx.globalAlpha = 1;
          return true;
        });
      }

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [mode]);

  const resetVisualState = () => {
    const canvas = canvasRef.current;
    if (canvas) canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height);
    ringsRef.current = [];
    melodyRef.current = [];
    pitchHistoryRef.current = [];
    prevEnergyRef.current = 0;
    dbfsRef.current = -100;
    rmsRef.current = 0;
    loudnessRef.current = 0;
    lastRingAtRef.current = 0;
    renderColorRef.current = colorRef.current || BASE_COLOR;
  };

  const handleToggle = () => {
    if (state === "listening") {
      stop();
    } else {
      resetVisualState();
      start();
    }
  };

  const handleModeChange = (value: "loudness" | "pitch") => {
    if (value === mode) return;
    if (state === "listening") stop();
    setMode(value);
    resetVisualState();
  };

  const emotion = applyEmotion(colorRef.current || BASE_COLOR, featuresRef.current);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#0d0d0d]">
      <canvas ref={canvasRef} className="absolute inset-0" />

      <Link
        to="/"
        className="absolute top-4 left-4 z-10 text-white/40 hover:text-white/80 text-xs font-mono transition"
      >
        ← Chromavoice
      </Link>

      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 text-white/30 text-xs font-mono tracking-widest uppercase">
        Live Experience
      </div>

      <div className="absolute top-4 right-4 z-10 glass rounded-xl px-3 py-2">
        <label className="sr-only" htmlFor="visualization-mode">
          Visualization mode
        </label>
        <select
          id="visualization-mode"
          value={mode}
          onChange={(e) => handleModeChange(e.target.value as "loudness" | "pitch")}
          className="bg-transparent text-xs font-mono tracking-wide text-white/80 outline-none"
        >
          <option value="loudness" className="text-black">
            Loudness
          </option>
          <option value="pitch" className="text-black">
            Pitch Scroll
          </option>
        </select>
      </div>

      {mode === "loudness" ? (
        <div
          className="absolute left-4 z-10 glass rounded-xl px-4 py-3"
          style={{ bottom: "calc(5rem + env(safe-area-inset-bottom, 0px))" }}
        >
          <div className="font-mono text-[10px] text-white/50 tracking-widest uppercase">
            Loudness
          </div>
          <div
            className="font-serif text-2xl"
            style={{
              color: chroma
                .mix(
                  colorRef.current || BASE_COLOR,
                  "#ffffff",
                  0.2 + loudnessRef.current * 0.65,
                  "lab",
                )
                .hex(),
            }}
          >
            {Math.round(loudnessRef.current * 100)}%
          </div>
          <div className="mt-1 font-mono text-xs text-white/60">
            RMS: {rmsRef.current.toFixed(4)} · {dbfsRef.current.toFixed(1)} dBFS
          </div>
          <div className="mt-2 h-1.5 w-40 overflow-hidden rounded-full bg-white/15">
            <div
              className="h-full rounded-full transition-all duration-75"
              style={{
                width: `${Math.max(2, Math.round(loudnessRef.current * 100))}%`,
                background: chroma
                  .mix(
                    colorRef.current || BASE_COLOR,
                    "#ffffff",
                    0.2 + loudnessRef.current * 0.65,
                    "lab",
                  )
                  .hex(),
              }}
            />
          </div>
        </div>
      ) : (
        <div
          className="absolute left-4 z-10 glass rounded-xl px-4 py-3"
          style={{ bottom: "calc(5rem + env(safe-area-inset-bottom, 0px))" }}
        >
          <div
            className="font-serif italic text-2xl"
            style={{
              color: emotion.color,
            }}
          >
            {emotion.emotionLabel}
          </div>
          <div className="font-mono text-xs text-white/50 mt-0.5">
            {(colorRef.current || BASE_COLOR).toUpperCase()}
          </div>
        </div>
      )}

      <div
        className="absolute left-1/2 -translate-x-1/2 z-10"
        style={{ bottom: "calc(2rem + env(safe-area-inset-bottom, 0px))" }}
      >
        <button
          onClick={handleToggle}
          className="px-8 py-3 rounded-full glass text-sm font-medium transition-all"
          style={{
            boxShadow:
              state === "listening"
                ? mode === "loudness"
                  ? `0 0 ${18 + loudnessRef.current * 30}px ${chroma.mix(colorRef.current || BASE_COLOR, "#ffffff", 0.25, "lab").hex()}99`
                  : `0 0 30px ${colorRef.current || BASE_COLOR}66`
                : "none",
          }}
        >
          {state === "listening" ? "Stop" : "Start"}
        </button>
      </div>
    </div>
  );
}
