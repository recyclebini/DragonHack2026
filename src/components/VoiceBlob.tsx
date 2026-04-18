import { CSSProperties, useEffect, useRef, useState } from "react";
import chroma from "chroma-js";

type Props = {
  color: string;
  energy: number;
  size?: number;
  className?: string;
};

// How fast the trailing edge chases the true color per frame (~60fps → ~2.5s full travel)
const LERP = 0.022;

export function VoiceBlob({ color, energy, size = 320, className = "" }: Props) {
  const [trail, setTrail] = useState<string>(color);
  const trailRef = useRef(color);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const target = color;
    const step = () => {
      const curr = trailRef.current;
      if (chroma.distance(curr, target, "oklab") < 1.5) {
        trailRef.current = target;
        setTrail(target);
        return;
      }
      const next = chroma.mix(curr, target, LERP, "oklab").hex();
      trailRef.current = next;
      setTrail(next);
      rafRef.current = requestAnimationFrame(step);
    };
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [color]);

  const scale = 1 + Math.min(0.25, energy * 0.6);

  // Outer layer: fast true color at center → slow trail at edges
  const outerStyle: CSSProperties = {
    width: size,
    height: size,
    background: `radial-gradient(circle at 38% 35%,
      ${color} 0%,
      ${chroma.mix(color, trail, 0.45, "oklab").hex()} 30%,
      ${trail} 58%,
      color-mix(in oklab, ${trail} 35%, transparent) 78%,
      transparent 100%)`,
    transform: `scale(${scale})`,
    transition: "transform 90ms ease-out",
    filter: "blur(3px)",
    // @ts-expect-error css var
    "--blob-color": color,
  };

  // Inner soft orb: true color bleeds into trail for depth
  const innerStyle: CSSProperties = {
    background: `radial-gradient(circle at 58% 65%,
      ${color} 0%,
      ${chroma.mix(color, trail, 0.6, "oklab").hex()} 40%,
      transparent 80%)`,
    animationDelay: "-3s",
    filter: "blur(10px)",
  };

  return (
    <div className={`relative ${className}`} style={{ width: size, height: size }}>
      <div className="absolute inset-0 rounded-full animate-blob glow-ring" style={outerStyle} />
      <div className="absolute inset-6 rounded-full animate-blob opacity-60" style={innerStyle} />
    </div>
  );
}
