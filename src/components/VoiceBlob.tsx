import { CSSProperties } from "react";

type Props = {
  color: string;
  energy: number;
  size?: number;
  className?: string;
};

export function VoiceBlob({ color, energy, size = 320, className = "" }: Props) {
  const scale = 1 + Math.min(0.25, energy * 0.6);
  const style: CSSProperties = {
    width: size,
    height: size,
    background: `radial-gradient(circle at 35% 30%, ${color} 0%, ${color} 35%, color-mix(in oklab, ${color} 40%, transparent) 75%, transparent 100%)`,
    transform: `scale(${scale})`,
    transition: "transform 80ms ease-out, background 120ms ease-out",
    filter: "blur(2px)",
    // @ts-expect-error css var
    "--blob-color": color,
  };
  return (
    <div className={`relative ${className}`} style={{ width: size, height: size }}>
      <div className="absolute inset-0 rounded-full animate-blob glow-ring" style={style} />
      <div
        className="absolute inset-6 rounded-full animate-blob opacity-70"
        style={{
          background: `radial-gradient(circle at 60% 70%, ${color}, transparent 70%)`,
          animationDelay: "-3s",
          filter: "blur(8px)",
        }}
      />
    </div>
  );
}
