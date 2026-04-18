import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { Link } from "@tanstack/react-router";
import { useVoiceAnalyzer } from "@/hooks/use-voice-analyzer";
import { applyEmotion, featuresToColor } from "@/lib/voice-color";
import type { VoiceFeatures } from "@/lib/voice-color";

export const Route = createFileRoute("/visualize")({
  component: VisualizePage,
});

type Ring = { x: number; y: number; maxR: number; color: string; startTime: number };
type Dot  = { x: number; y: number; r: number; color: string; startTime: number };

function VisualizePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { state, start, stop, color, features } = useVoiceAnalyzer();

  // Keep live values accessible in the rAF loop without stale closures
  const colorRef    = useRef<string>(color);
  const featuresRef = useRef<VoiceFeatures>(features);
  const ringsRef    = useRef<Ring[]>([]);
  const dotsRef     = useRef<Dot[]>([]);
  const prevEnergyRef = useRef(0);
  const melodyRef   = useRef<number[]>([]);

  useEffect(() => { colorRef.current = color; }, [color]);
  useEffect(() => { featuresRef.current = features; }, [features]);

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

      // Slow background fade toward current color
      ctx.globalAlpha = 0.04;
      ctx.fillStyle = hex;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;

      // Melody thread — normalized pitch → y position
      const pitchNorm = Math.max(0, Math.min(1, ((f.pitch || 150) - 60) / (800 - 60)));
      const targetY = h * (0.85 - pitchNorm * 0.7);
      melodyRef.current.push(targetY);
      if (melodyRef.current.length > w) melodyRef.current.shift();

      const pts = melodyRef.current;
      if (pts.length > 1) {
        ctx.beginPath();
        const startX = Math.max(0, w - pts.length);
        for (let i = 0; i < pts.length; i++) {
          if (i === 0) ctx.moveTo(startX + i, pts[i]);
          else         ctx.lineTo(startX + i, pts[i]);
        }
        ctx.strokeStyle = hex;
        ctx.lineWidth   = 1.5;
        ctx.globalAlpha = 0.7;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // Energy spike → ring + dot
      const delta = Math.abs(f.energy - prevEnergyRef.current);
      if (delta > 0.25) {
        ringsRef.current.push({ x: w / 2, y: h / 2, maxR: Math.min(w, h) * 0.4, color: hex, startTime: timestamp });
        dotsRef.current.push({
          x: Math.random() * w, y: Math.random() * h,
          r: 4 + Math.random() * 4,
          color: emotion.color,
          startTime: timestamp,
        });
      }
      prevEnergyRef.current = f.energy;

      // Rings — expand and fade over 800ms
      ringsRef.current = ringsRef.current.filter((ring) => {
        const age = timestamp - ring.startTime;
        if (age > 800) return false;
        const t   = age / 800;
        const r   = 10 + (ring.maxR - 10) * t;
        ctx.beginPath();
        ctx.arc(ring.x, ring.y, r, 0, Math.PI * 2);
        ctx.strokeStyle  = ring.color;
        ctx.lineWidth    = 2;
        ctx.globalAlpha  = (1 - t) * 0.6;
        ctx.stroke();
        ctx.globalAlpha  = 1;
        return true;
      });

      // Dots — fade over 500ms
      dotsRef.current = dotsRef.current.filter((dot) => {
        const age = timestamp - dot.startTime;
        if (age > 500) return false;
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, dot.r, 0, Math.PI * 2);
        ctx.fillStyle   = dot.color;
        ctx.globalAlpha = 1 - age / 500;
        ctx.fill();
        ctx.globalAlpha = 1;
        return true;
      });

      // Emotion label — top-left
      ctx.font      = "italic 48px 'Instrument Serif', Georgia, serif";
      ctx.fillStyle = emotion.color;
      ctx.globalAlpha = 0.9;
      ctx.fillText(emotion.emotionLabel, 24, 64);

      // Hex — top-right
      const hexText = hex.toUpperCase();
      ctx.font      = "14px monospace";
      ctx.fillStyle = "#ffffff";
      ctx.globalAlpha = 0.5;
      const tw = ctx.measureText(hexText).width;
      ctx.fillText(hexText, w - tw - 24, 32);
      ctx.globalAlpha = 1;

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
      melodyRef.current = [];
      ringsRef.current  = [];
      dotsRef.current   = [];
      prevEnergyRef.current = 0;
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

      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10">
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
