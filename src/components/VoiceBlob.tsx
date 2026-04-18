import { CSSProperties, useEffect, useRef, useState } from "react";
import chroma from "chroma-js";

type Props = {
  color: string;
  energy: number;
  size?: number;
  className?: string;
};

// ~2.5s full travel at 60fps
const LERP = 0.022;

export function VoiceBlob({ color, energy, size = 320, className = "" }: Props) {
  const [display, setDisplay] = useState<string>(color);
  const displayRef = useRef(color);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const target = color;
    const step = () => {
      const curr = displayRef.current;
      if (chroma.distance(curr, target, "oklab") < 1.5) {
        displayRef.current = target;
        setDisplay(target);
        return;
      }
      const next = chroma.mix(curr, target, LERP, "oklab").hex();
      displayRef.current = next;
      setDisplay(next);
      rafRef.current = requestAnimationFrame(step);
    };
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [color]);

  const scale = 1 + Math.min(0.22, energy * 0.55);
  const dim = chroma(display).darken(0.8).hex();

  return (
    <div className={`relative ${className}`} style={{ width: size, height: size }}>
      {/* main orb */}
      <div
        className="absolute inset-0 rounded-full animate-blob"
        style={{
          background: `radial-gradient(circle at 40% 38%, ${display} 0%, ${dim} 55%, transparent 78%)`,
          transform: `scale(${scale})`,
          transition: "transform 90ms ease-out",
          filter: "blur(2px)",
        } as CSSProperties}
      />
      {/* soft inner highlight — slightly offset for depth */}
      <div
        className="absolute rounded-full animate-blob"
        style={{
          inset: "18%",
          background: `radial-gradient(circle at 38% 36%, ${chroma(display).brighten(0.6).alpha(0.55).css()} 0%, transparent 65%)`,
          animationDelay: "-2s",
          filter: "blur(6px)",
        }}
      />
      {/* outer glow ring */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: `radial-gradient(circle, ${chroma(display).alpha(0.18).css()} 50%, transparent 75%)`,
          transform: `scale(${1 + scale * 0.08})`,
          transition: "transform 90ms ease-out",
          filter: "blur(18px)",
        }}
      />
    </div>
  );
}
