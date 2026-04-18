import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Mic, Square, Save, ArrowRight } from "lucide-react";
import { useVoiceAnalyzer } from "@/hooks/use-voice-analyzer";
import { VoiceBlob } from "@/components/VoiceBlob";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { describeVoice } from "@/lib/voice-color";
import { saveVoice } from "@/lib/voice-store";
import { VoiceCard } from "@/components/VoiceCard";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Chromavoice — Turn your voice into a color" },
      { name: "description", content: "Speak into your mic and watch your voice become a living color. Save it, share it, find your harmony." },
      { property: "og:title", content: "Chromavoice — Turn your voice into a color" },
      { property: "og:description", content: "A poetic web instrument that paints your voice in real time." },
    ],
  }),
  component: RecordPage,
});

function RecordPage() {
  const { state, start, stop, color, features } = useVoiceAnalyzer();
  const [locked, setLocked] = useState<string | null>(null);
  const [name, setName] = useState("");

  const finalHex = locked ?? color;
  const desc = describeVoice(finalHex);

  const handleStop = () => {
    setLocked(color);
    stop();
  };

  const handleReset = () => {
    setLocked(null);
  };

  const handleSave = () => {
    if (!locked) return;
    saveVoice({ name: name.trim() || "Anonymous", hex: desc.hex, colorName: desc.name, poem: desc.poem });
    toast.success(`${name || "Your voice"} added to the map`);
    setName("");
    setLocked(null);
  };

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-5 pt-8 pb-24">
        <section className="text-center max-w-2xl mx-auto animate-fade-up">
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground mb-4">
            For those who feel music in color
          </p>
          <h1 className="font-display text-5xl md:text-6xl font-semibold leading-[1.05] text-balance">
            Your voice has{" "}
            <span className="font-serif italic font-normal" style={{ color: finalHex }}>
              a color
            </span>
            .
          </h1>
          <p className="mt-5 text-muted-foreground text-balance">
            Tap the mic and speak. Pitch becomes brightness, timbre becomes hue. What you make, only you could make.
          </p>
        </section>

        <section className="mt-12 flex flex-col items-center gap-8">
          <div className="relative">
            <div
              className={`absolute inset-0 rounded-full ${state === "listening" ? "animate-ring-pulse" : ""}`}
              style={{
                width: 380, height: 380, left: -30, top: -30,
                background: `radial-gradient(circle, ${finalHex}33 0%, transparent 60%)`,
              }}
            />
            <VoiceBlob color={finalHex} energy={locked ? 0.2 : features.energy} size={320} />
          </div>

          {!locked && (
            <div className="flex flex-col items-center gap-3">
              {state !== "listening" ? (
                <Button
                  onClick={start}
                  size="lg"
                  className="rounded-full h-14 px-8 text-base font-medium"
                  style={{ background: finalHex, color: "#0d0d0d" }}
                >
                  <Mic className="size-5" />
                  Start listening
                </Button>
              ) : (
                <Button
                  onClick={handleStop}
                  size="lg"
                  variant="secondary"
                  className="rounded-full h-14 px-8 text-base font-medium glass"
                >
                  <Square className="size-4 fill-current" />
                  Lock my color
                </Button>
              )}
              {state === "denied" && (
                <p className="text-sm text-destructive">Microphone access was denied.</p>
              )}
              {state === "error" && (
                <p className="text-sm text-destructive">Something went wrong with your mic.</p>
              )}
              {state === "listening" && (
                <p className="text-xs text-muted-foreground tabular-nums">
                  {Math.round(features.pitch)} Hz · brightness {features.brightness.toFixed(2)}
                </p>
              )}
            </div>
          )}

          {locked && (
            <div className="w-full max-w-md flex flex-col items-center gap-5 animate-fade-up">
              <div className="text-center space-y-1">
                <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">{desc.name}</p>
                <p className="font-mono text-sm">{desc.hex.toUpperCase()}</p>
                <p className="font-serif text-xl mt-3 text-balance">“{desc.poem}”</p>
              </div>
              <div className="w-full glass rounded-2xl p-4 flex flex-col sm:flex-row gap-2">
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  className="bg-transparent border-white/10"
                />
                <Button onClick={handleSave} className="rounded-xl" style={{ background: finalHex, color: "#0d0d0d" }}>
                  <Save className="size-4" />
                  Save my voice
                </Button>
              </div>
              <button onClick={handleReset} className="text-xs text-muted-foreground hover:text-foreground transition">
                Try again
              </button>
            </div>
          )}
        </section>

        {locked && (
          <section className="mt-16 grid md:grid-cols-2 gap-10 items-center max-w-4xl mx-auto">
            <VoiceCard voice={{ name: name || "Anonymous", hex: desc.hex, colorName: desc.name, poem: desc.poem }} />
            <div className="space-y-4">
              <h2 className="font-display text-2xl font-semibold">Share your color.</h2>
              <p className="text-muted-foreground">
                Download the card or save your voice to the shared map and discover whose voice harmonizes with yours.
              </p>
              <Link to="/map" className="inline-flex items-center gap-2 text-sm font-medium hover:underline">
                Visit the Voice Map <ArrowRight className="size-4" />
              </Link>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
