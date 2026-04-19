import { useRef, useState } from "react";
import { toPng } from "html-to-image";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import type { SavedVoice } from "@/lib/voice-store";

type Props = {
  voice: { name: string; hex: string; colorName: string; poem: string } | SavedVoice;
};

export function VoiceCard({ voice }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);

  const download = async () => {
    if (!ref.current) return;
    setBusy(true);
    try {
      const dataUrl = await toPng(ref.current, { pixelRatio: 2, cacheBust: true });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `seenesthesia-${voice.name || "voice"}.png`;
      a.click();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <div
        ref={ref}
        className="w-[340px] rounded-3xl overflow-hidden glass p-6 flex flex-col gap-5"
        style={{ boxShadow: `0 30px 80px -20px ${voice.hex}55` }}
      >
        <div
          className="aspect-[4/3] rounded-2xl relative overflow-hidden"
          style={{
            background: `radial-gradient(circle at 30% 30%, ${voice.hex}, color-mix(in oklab, ${voice.hex} 30%, black) 100%)`,
          }}
        >
          <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between text-white/85 text-xs font-mono">
            <span>{voice.hex.toUpperCase()}</span>
            <span className="opacity-70">SEENESTHESIA</span>
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{voice.colorName}</p>
          <h3 className="font-display text-2xl font-semibold">{voice.name || "Anonymous"}</h3>
          <p className="font-serif text-lg leading-snug text-foreground/85 text-balance">
            “{voice.poem}”
          </p>
        </div>
      </div>
      <Button onClick={download} disabled={busy} variant="secondary" className="rounded-full">
        <Download className="size-4" />
        {busy ? "Rendering…" : "Download as image"}
      </Button>
    </div>
  );
}
