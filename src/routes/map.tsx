import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Sparkles, Trash2 } from "lucide-react";
import { clearVoices, getVoices, type SavedVoice } from "@/lib/voice-store";
import { harmonyScores } from "@/lib/voice-color";
import { VoiceCard } from "@/components/VoiceCard";

export const Route = createFileRoute("/map")({
  head: () => ({
    meta: [
      { title: "Voice Map — Chromavoice" },
      { name: "description", content: "A constellation of voices, each one a glowing color." },
      { property: "og:title", content: "Voice Map — Chromavoice" },
      { property: "og:description", content: "Find the voices in harmony with yours." },
    ],
  }),
  component: MapPage,
});

// deterministic positions per voice id
function posFor(id: string, w: number, h: number) {
  let h1 = 0;
  let h2 = 0;
  for (let i = 0; i < id.length; i++) {
    h1 = (h1 * 31 + id.charCodeAt(i)) >>> 0;
    h2 = (h2 * 17 + id.charCodeAt(i) * 7) >>> 0;
  }
  const x = 80 + ((h1 % 1000) / 1000) * (w - 160);
  const y = 80 + ((h2 % 1000) / 1000) * (h - 160);
  return { x, y };
}

function MapPage() {
  const [voices, setVoices] = useState<SavedVoice[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [showHarmony, setShowHarmony] = useState(false);
  const [size, setSize] = useState({ w: 800, h: 520 });

  useEffect(() => {
    setVoices(getVoices());
    const onResize = () => {
      const w = Math.min(1100, window.innerWidth - 60);
      setSize({ w, h: Math.max(420, Math.min(640, w * 0.6)) });
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const selectedVoice = voices.find((v) => v.id === selected) ?? null;
  const scores = useMemo(() => {
    if (!selectedVoice) return new Map<string, number>();
    const others = voices.filter((v) => v.id !== selectedVoice.id);
    const s = harmonyScores(selectedVoice.hex, others.map((v) => v.hex));
    return new Map(others.map((v, i) => [v.id, s[i]]));
  }, [selectedVoice, voices]);

  const handleClear = () => {
    if (confirm("Clear all saved voices?")) {
      clearVoices();
      setVoices([]);
      setSelected(null);
    }
  };

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-5 pt-6 pb-24">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
          <div>
            <h1 className="font-display text-4xl font-semibold">Voice Map</h1>
            <p className="text-muted-foreground mt-1">
              {voices.length} {voices.length === 1 ? "voice" : "voices"} saved · click a dot to inspect
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              className="rounded-full glass"
              disabled={!selectedVoice}
              onClick={() => setShowHarmony((h) => !h)}
            >
              <Sparkles className="size-4" />
              {showHarmony ? "Hide harmony" : "Find my harmony"}
            </Button>
            {voices.length > 0 && (
              <Button variant="ghost" className="rounded-full" onClick={handleClear}>
                <Trash2 className="size-4" />
                Clear
              </Button>
            )}
          </div>
        </div>

        <div
          className="relative glass rounded-3xl overflow-hidden"
          style={{ height: size.h, background: "radial-gradient(circle at 50% 30%, oklch(0.2 0.05 280) 0%, oklch(0.1 0.02 270) 80%)" }}
        >
          {voices.length === 0 ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
              <p className="font-serif text-2xl text-muted-foreground">The sky is empty.</p>
              <p className="text-sm text-muted-foreground mt-2">Record your first voice to start the constellation.</p>
            </div>
          ) : (
            voices.map((v) => {
              const { x, y } = posFor(v.id, size.w, size.h);
              const isSelected = v.id === selected;
              const score = scores.get(v.id) ?? 0;
              const dim = showHarmony && selectedVoice && !isSelected && score < 0.4;
              const highlighted = showHarmony && score > 0.4 && !isSelected;
              const r = 18 + (highlighted ? 10 : 0) + (isSelected ? 14 : 0);
              return (
                <button
                  key={v.id}
                  onClick={() => setSelected(v.id)}
                  className="absolute group transition-all"
                  style={{
                    left: x - r,
                    top: y - r,
                    width: r * 2,
                    height: r * 2,
                    opacity: dim ? 0.2 : 1,
                  }}
                  aria-label={v.name}
                >
                  <span
                    className="absolute inset-0 rounded-full animate-float"
                    style={{
                      background: `radial-gradient(circle, ${v.hex} 0%, ${v.hex}99 40%, transparent 75%)`,
                      boxShadow: `0 0 30px ${v.hex}, 0 0 80px ${v.hex}66`,
                      animationDelay: `${(v.id.charCodeAt(0) % 6) * -1}s`,
                    }}
                  />
                  {isSelected && (
                    <span
                      className="absolute -inset-2 rounded-full border animate-ring-pulse"
                      style={{ borderColor: v.hex }}
                    />
                  )}
                  <span className="absolute left-1/2 top-full mt-2 -translate-x-1/2 whitespace-nowrap text-xs glass px-2 py-1 rounded-md opacity-0 group-hover:opacity-100 transition pointer-events-none">
                    {v.name} · <span className="text-muted-foreground">{v.colorName}</span>
                  </span>
                </button>
              );
            })
          )}
        </div>

        {selectedVoice && (
          <div className="mt-10 grid md:grid-cols-2 gap-10 items-start animate-fade-up">
            <VoiceCard voice={selectedVoice} />
            <div className="space-y-3">
              <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Selected voice</p>
              <h2 className="font-display text-3xl font-semibold">{selectedVoice.name}</h2>
              <p className="text-muted-foreground">
                {showHarmony
                  ? "Brighter dots are voices that harmonize — analogous (next to) or complementary (opposite) on the color wheel."
                  : "Tap “Find my harmony” to see which voices resonate with this one."}
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
