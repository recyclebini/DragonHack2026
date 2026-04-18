import chroma from "chroma-js";

export type VoiceFeatures = {
  pitch: number; // Hz
  brightness: number; // spectral centroid normalized 0..1
  energy: number; // RMS 0..1
};

export type VoiceColor = {
  hex: string;
  name: string;
  poem: string;
};

// Map features → HSL color
// Pitch is the primary hue driver: bass (80Hz) → reds/oranges, tenor (200Hz) → greens/teals, soprano (400Hz+) → blues/purples
// Brightness (spectral centroid) adds a ±80° timbral shift for variation within a pitch range
export function featuresToColor(f: VoiceFeatures): string {
  const p = Math.max(60, Math.min(800, f.pitch || 150));
  const pitchNorm = (Math.log(p) - Math.log(60)) / (Math.log(800) - Math.log(60));
  const hue = (Math.round(pitchNorm * 240 + f.brightness * 80) + 360) % 360;
  const lightness = 35 + Math.min(f.energy * 25, 20);
  const saturation = 65 + Math.min(f.energy * 20, 15);
  return chroma.hsl(hue, saturation / 100, lightness / 100).hex();
}

const HUE_NAMES: { range: [number, number]; words: string[] }[] = [
  { range: [0, 20], words: ["Ember", "Crimson", "Garnet", "Rust"] },
  { range: [20, 45], words: ["Amber", "Copper", "Sunset", "Ochre"] },
  { range: [45, 70], words: ["Saffron", "Honey", "Marigold", "Citrine"] },
  { range: [70, 100], words: ["Chartreuse", "Lime", "Moss", "Jade"] },
  { range: [100, 160], words: ["Verdant", "Pine", "Sage", "Emerald"] },
  { range: [160, 200], words: ["Teal", "Lagoon", "Mint", "Cyan"] },
  { range: [200, 240], words: ["Cerulean", "Cobalt", "Azure", "Sapphire"] },
  { range: [240, 280], words: ["Indigo", "Iris", "Amethyst", "Violet"] },
  { range: [280, 320], words: ["Orchid", "Magenta", "Plum", "Mauve"] },
  { range: [320, 361], words: ["Rose", "Fuchsia", "Berry", "Wine"] },
];

const TONE_PREFIX_LIGHT = ["Soft", "Pale", "Luminous", "Bright", "Hushed"];
const TONE_PREFIX_MID = ["Warm", "Calm", "Quiet", "Open", "Rich"];
const TONE_PREFIX_DARK = ["Deep", "Velvet", "Midnight", "Smoky", "Grounded"];

export function nameForColor(hex: string): string {
  const [h, , l] = chroma(hex).hsl();
  const hue = isNaN(h) ? 0 : h;
  const fam = HUE_NAMES.find((g) => hue >= g.range[0] && hue < g.range[1]) ?? HUE_NAMES[0];
  const idx = Math.floor((hue - fam.range[0]) / Math.max(1, fam.range[1] - fam.range[0]) * fam.words.length);
  const base = fam.words[Math.min(fam.words.length - 1, idx)];
  const prefixSet = l > 0.65 ? TONE_PREFIX_LIGHT : l > 0.4 ? TONE_PREFIX_MID : TONE_PREFIX_DARK;
  const prefix = prefixSet[Math.floor(hex.charCodeAt(2) % prefixSet.length)];
  return `${prefix} ${base}`;
}

export function poemForColor(hex: string): string {
  const [, , l] = chroma(hex).hsl();
  const lines =
    l > 0.65
      ? [
          "A voice like dawn through linen.",
          "Light moves where you speak.",
          "The kind of voice that opens windows.",
        ]
      : l > 0.4
        ? [
            "A grounding presence. The kind of voice that fills a room.",
            "Steady as a held note.",
            "Warm enough to lean into.",
          ]
        : [
            "Deep water. Slow current.",
            "A voice the dark recognizes.",
            "Low light, long shadow, full chest.",
          ];
  return lines[Math.floor(hex.charCodeAt(4) % lines.length)];
}

export function describeVoice(hex: string): VoiceColor {
  return { hex, name: nameForColor(hex), poem: poemForColor(hex) };
}

// Color theory helpers for "find my harmony"
export function harmonyScores(target: string, others: string[]): number[] {
  const tH = chroma(target).hsl()[0] || 0;
  return others.map((o) => {
    const oH = chroma(o).hsl()[0] || 0;
    const diff = Math.min(Math.abs(tH - oH), 360 - Math.abs(tH - oH));
    const analog = Math.max(0, 1 - Math.abs(diff - 30) / 30);
    const comp = Math.max(0, 1 - Math.abs(diff - 180) / 30);
    return Math.max(analog, comp);
  });
}

// Average the colors of a group of voices — for "group voice" feature
export function groupColor(hexes: string[]): string {
  if (hexes.length === 0) return "#7a5cff";
  if (hexes.length === 1) return hexes[0];
  // Average in oklab for perceptually accurate blending
  const colors = hexes.map((h) => chroma(h).oklab());
  const avg = colors.reduce(
    (acc, [l, a, b]) => [acc[0] + l, acc[1] + a, acc[2] + b],
    [0, 0, 0]
  ).map((v) => v / colors.length) as [number, number, number];
  return chroma.oklab(...avg).hex();
}
