import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import chroma from "chroma-js";
import { useVoiceAnalyzer } from "@/hooks/use-voice-analyzer";
import { applyEmotion } from "@/lib/voice-color";
import type { VoiceFeatures } from "@/lib/voice-color";

export const Route = createFileRoute("/visualize")({
  component: VisualizePage,
});

type Ring = { x: number; y: number; maxR: number; color: string; startTime: number };

function VisualizePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { state, start, stop, color, features } = useVoiceAnalyzer();

  const colorRef        = useRef<string>(color);
  const featuresRef     = useRef<VoiceFeatures>(features);
  const ringsRef        = useRef<Ring[]>([]);
  const prevEnergyRef   = useRef(0);
  const melodyRef       = useRef<number[]>([]);
  const pitchHistoryRef = useRef<number[]>([]);
  const renderColorRef  = useRef<string>(color);
  const emotionLabelRef = useRef<string>("Neutral");
  const emotionColorRef = useRef<string>("#7a5cff");
  const emotionHexRef   = useRef<string>("#7a5cff");

  const [emotionDisplay, setEmotionDisplay] = useState<{ label: string; color: string; hex: string }>({
    label: "Neutral",
    color: "#7a5cff",
    hex: "#7a5cff",
  });

  useEffect(() => { colorRef.current = color; }, [color]);
  useEffect(() => { featuresRef.current = features; }, [features]);

  // Poll refs to update DOM overlay every 100ms
  useEffect(() => {
    const interval = setInterval(() => {
      setEmotionDisplay({
        label: emotionLabelRef.current,
        color: emotionColorRef.current,
        hex: emotionHexRef.current,
      });
    }, 100);
    return () => clearInterval(interval);
  }, []);

  // Canvas draw loop — runs once, reads from refs every frame
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const ctx = canvas.getContext("2d")!;
    let raf = 0;

    const draw = (timestamp: number) => {
      const w = canvas.width;
      const h = canvas.height;
      const hex = colorRef.current;
      const f   = featuresRef.current;
      const emotion = applyEmotion(hex, f);

      // Update emotion refs for DOM overlay
      emotionLabelRef.current = emotion.emotionLabel;
      emotionColorRef.current = emotion.color;
      emotionHexRef.current   = hex.toUpperCase();

      // Lerp renderColorRef toward current color using chroma lab interpolation
      try {
        const targetHex = colorRef.current;
        const mixed = chroma.mix(renderColorRef.current, targetHex, 0.03, "lab").hex();
        renderColorRef.current = mixed;
      } catch {
        renderColorRef.current = colorRef.current;
      }

      const renderColor = renderColorRef.current;

      // Slow background fade toward rendered color
      ctx.globalAlpha = 0.02;
      ctx.fillStyle = renderColor;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;

      // Melody thread — normalized pitch → y position with pitch history smoothing
      const pitchNorm = Math.max(0, Math.min(1, ((f.pitch || 150) - 60) / (800 - 60)));
      pitchHistoryRef.current.push(pitchNorm);
      if (pitchHistoryRef.current.length > 10) pitchHistoryRef.current.shift();
      const avgPitch = pitchHistoryRef.current.reduce((a, b) => a + b, 0) / pitchHistoryRef.current.length;
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
        ctx.lineWidth   = 1.5;
        ctx.globalAlpha = 0.6;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // Energy spike → ring (max 2 alive at once)
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

      // Rings — expand and fade over 1500ms
      ringsRef.current = ringsRef.current.filter((ring) => {
        const age = timestamp - ring.startTime;
        if (age > 1500) return false;
        const t = age / 1500;
        const r = 10 + (ring.maxR - 10) * t;
        ctx.beginPath();
        ctx.arc(ring.x, ring.y, r, 0, Math.PI * 2);
        ctx.strokeStyle = ring.color;
        ctx.lineWidth   = 2;
        ctx.globalAlpha = (1 - t) * 0.4;
        ctx.stroke();
        ctx.globalAlpha = 1;
        return true;
      });

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  const handleToggle = () => {
    if (state === "listening") {
      stop();
    } else {
      const canvas = canvasRef.current;
      if (canvas) canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height);
      melodyRef.current       = [];
      ringsRef.current        = [];
      pitchHistoryRef.current = [];
      prevEnergyRef.current   = 0;
      renderColorRef.current  = colorRef.current;
      start();
    }
  };

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

      {/* Emotion DOM overlay — bottom-left glass card */}
      <div className="absolute left-4 z-10 glass rounded-xl px-4 py-3" style={{ bottom: "calc(5rem + env(safe-area-inset-bottom, 0px))" }}>
        <div
          className="font-serif italic text-2xl"
          style={{ color: emotionDisplay.color }}
        >
          {emotionDisplay.label}
        </div>
        <div className="font-mono text-xs text-white/50 mt-0.5">
          {emotionDisplay.hex}
        </div>
      </div>

      <div className="absolute left-1/2 -translate-x-1/2 z-10" style={{ bottom: "calc(2rem + env(safe-area-inset-bottom, 0px))" }}>
        <button
          onClick={handleToggle}
          className="px-8 py-3 rounded-full glass text-sm font-medium transition-all"
          style={{ boxShadow: state === "listening" ? `0 0 30px ${color}66` : "none" }}
        >
          {state === "listening" ? "Stop" : "Start"}
        </button>
      </div>
    </div>
  );
}
