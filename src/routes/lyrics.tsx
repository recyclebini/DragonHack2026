import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import chroma from "chroma-js";
import { SiteHeader } from "@/components/SiteHeader";
import { Textarea } from "@/components/ui/textarea";
import { getVoices, type SavedVoice } from "@/lib/voice-store";

export const Route = createFileRoute("/lyrics")({
  head: () => ({
    meta: [
      { title: "Lyrics in Color — Chromavoice" },
      { name: "description", content: "Paste lyrics. See them sing in color. For those who feel music in color." },
    ],
  }),
  component: LyricsPage,
});

const SAMPLE = `I have been bent and broken, but —
I hope — into a better shape.
And the night is dark and full of stars,
and I am singing, I am singing, I am singing.`;

function colorForWord(word: string, lineIndex: number, totalLines: number, voices: SavedVoice[]): string {
  if (voices.length > 0) {
    // Assign each line to a voice (cycling), then shift hue slightly per word
    const voice = voices[lineIndex % voices.length];
    const baseHue = chroma(voice.hex).hsl()[0] || 0;
    const vowels = (word.match(/[aeiouAEIOU]/g) || []).length;
    const energy = Math.min(1, (word.length + vowels * 1.5) / 12);
    const lightness = 0.45 + energy * 0.3;
    const sat = 0.55 + energy * 0.25;
    const hueShift = ((word.charCodeAt(0) || 0) % 30) - 15;
    return chroma.hsl((baseHue + hueShift + 360) % 360, sat, lightness).hex();
  }
  // Fallback: no voices saved yet
  const baseHue = (lineIndex / Math.max(1, totalLines)) * 320 + 20;
  const vowels = (word.match(/[aeiouAEIOU]/g) || []).length;
  const energy = Math.min(1, (word.length + vowels * 1.5) / 12);
  return chroma.hsl(baseHue, 0.65 + energy * 0.25, 0.5 + energy * 0.3).hex();
}

function LyricsPage() {
  const [text, setText] = useState(SAMPLE);
  const voices = useMemo(() => getVoices(), []);
  const lines = useMemo(() => text.split("\n"), [text]);

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-5 pt-6 pb-24">
        <header className="mb-8">
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Accessibility · Synesthesia</p>
          <h1 className="font-display text-4xl md:text-5xl font-semibold mt-2">Lyrics in color</h1>
          <p className="font-serif text-xl text-muted-foreground mt-2">
            {voices.length > 0
              ? `Colored by ${voices.length} saved voice${voices.length > 1 ? "s" : ""} from your map.`
              : "For those who feel music in color."}
          </p>
          {voices.length > 0 && (
            <div className="flex gap-2 mt-3 flex-wrap">
              {voices.map((v) => (
                <span
                  key={v.id}
                  className="text-xs px-2 py-1 rounded-full"
                  style={{ background: `${v.hex}22`, border: `1px solid ${v.hex}55`, color: v.hex }}
                >
                  {v.name}
                </span>
              ))}
            </div>
          )}
        </header>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="glass rounded-3xl p-5 flex flex-col gap-3">
            <label className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Paste lyrics
            </label>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={16}
              placeholder="Paste any lyrics here..."
              className="bg-transparent border-white/10 resize-none font-serif text-lg leading-relaxed flex-1"
            />
            {voices.length === 0 && (
              <p className="text-xs text-muted-foreground">
                💡 Save voices on the Record page to color lyrics with real people's voices.
              </p>
            )}
          </div>

          <div className="glass rounded-3xl p-7 min-h-[420px] overflow-y-auto">
            {voices.length > 0 && (
              <div className="flex gap-1 flex-wrap mb-5">
                {voices.map((v, i) => (
                  <span key={v.id} className="text-xs text-muted-foreground">
                    Line {i + 1}, {i + 1 + voices.length}… ={" "}
                    <span style={{ color: v.hex }}>{v.name}</span>
                    {i < voices.length - 1 ? " · " : ""}
                  </span>
                ))}
              </div>
            )}
            <p className="font-serif text-2xl leading-relaxed">
              {lines.map((line, i) => (
                <span key={i} className="block mb-1">
                  {line.split(/(\s+)/).map((token, j) => {
                    if (/^\s+$/.test(token)) return <span key={j}>{token}</span>;
                    if (!token) return null;
                    const c = colorForWord(token, i, lines.length, voices);
                    return (
                      <span
                        key={j}
                        style={{ color: c, textShadow: `0 0 18px ${c}66` }}
                        className="transition-colors duration-300"
                      >
                        {token}
                      </span>
                    );
                  })}
                  {!line && <span>&nbsp;</span>}
                </span>
              ))}
            </p>
          </div>
        </div>

        {/* Accessibility note */}
        <div className="mt-10 glass rounded-2xl p-6 max-w-xl">
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
