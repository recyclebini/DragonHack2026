import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import chroma from "chroma-js";
import { SiteHeader } from "@/components/SiteHeader";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/lyrics")({
  head: () => ({
    meta: [
      { title: "Lyrics in Color — Chromavoice" },
      { name: "description", content: "Paste lyrics. See them sing in color. For those who feel music in color." },
      { property: "og:title", content: "Lyrics in Color — Chromavoice" },
      { property: "og:description", content: "Visual coloring of lyrics by line energy." },
    ],
  }),
  component: LyricsPage,
});

const SAMPLE = `I have been bent and broken, but —
I hope — into a better shape.
And the night is dark and full of stars,
and I am singing, I am singing, I am singing.`;

function colorForWord(word: string, lineIndex: number, totalLines: number): string {
  // Hue cycles slowly across the song; brightness comes from word "energy" (length + vowels)
  const baseHue = (lineIndex / Math.max(1, totalLines)) * 320 + 20;
  const vowels = (word.match(/[aeiouAEIOU]/g) || []).length;
  const energy = Math.min(1, (word.length + vowels * 1.5) / 12);
  const lightness = 0.5 + energy * 0.3; // 0.5..0.8
  const sat = 0.6 + energy * 0.3;
  return chroma.hsl(baseHue, sat, lightness).hex();
}

function LyricsPage() {
  const [text, setText] = useState(SAMPLE);

  const lines = useMemo(() => text.split("\n"), [text]);

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-5 pt-6 pb-24">
        <header className="mb-8">
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Accessibility · Synesthesia</p>
          <h1 className="font-display text-4xl md:text-5xl font-semibold mt-2">Lyrics in color</h1>
          <p className="font-serif text-xl text-muted-foreground mt-2">For those who feel music in color.</p>
        </header>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="glass rounded-3xl p-5">
            <label className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Paste lyrics
            </label>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={16}
              className="mt-2 bg-transparent border-white/10 resize-none font-serif text-lg leading-relaxed"
            />
          </div>

          <div className="glass rounded-3xl p-7 min-h-[420px]">
            <p className="font-serif text-2xl leading-relaxed text-balance">
              {lines.map((line, i) => (
                <span key={i} className="block">
                  {line.split(/(\s+)/).map((token, j) => {
                    if (/^\s+$/.test(token)) return <span key={j}>{token}</span>;
                    if (!token) return null;
                    const c = colorForWord(token, i, lines.length);
                    return (
                      <span
                        key={j}
                        style={{ color: c, textShadow: `0 0 20px ${c}55` }}
                        className="transition-colors"
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
      </main>
    </div>
  );
}
