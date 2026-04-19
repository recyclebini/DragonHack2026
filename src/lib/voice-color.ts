import chroma from "chroma-js";

export type VoiceFeatures = {
  pitch: number;      // Hz, fundamental frequency
  brightness: number; // spectral centroid normalized 0..1 (500–4000 Hz linear)
  energy: number;     // RMS 0..1
  hnr: number;        // harmonic-to-noise ratio proxy 0..1 (autocorrelation clarity)
};

export type VoiceColor = {
  hex: string;
  name: string;
  poem: string;
};

/** Idle / default voice color — matches `useVoiceAnalyzer` initial state and hero "a color" before input. */
export const DEFAULT_VOICE_HEX = "#7a5cff";

// CIELAB mapping — mirrors the Python script's Mapping A:
//   pitch 80–300 Hz  → L* 20–90  (low pitch = dark, high pitch = bright)
//   hnr   0–1        → a* -60–+80 (noisy/breathy = green, harmonic/clear = red)
//   centroid 0–1     → b* -60–+60 (dark timbre = blue, bright timbre = yellow)
export function featuresToColor(f: VoiceFeatures): string {
  const pitchNorm = Math.max(0, Math.min(1, ((f.pitch || 150) - 80) / (300 - 80)));
  const L = 20 + pitchNorm * 70;
  const A = -60 + (f.hnr ?? 0.5) * 140;
  const B = -60 + f.brightness * 120;
  return chroma.lab(L, A, B).hex();
}

// ── Identity Mode ─────────────────────────────────────────────────────────────
// Pitch (F0) → hue: the primary discriminator between people. Log scale 80-400Hz → 0-300°.
//   Bass (80-150Hz) = reds/oranges, tenor (150-250Hz) = greens, soprano (250-400Hz) = blues.
// Spectral centroid → lightness: calibrated to the voice range (800-2500Hz).
//   brightness = (centroid-500)/3500, so voice sits in 0.086-0.571 → stretched to 35%-65%.
export function identityColor(features: VoiceFeatures): string {
  const p = Math.max(80, Math.min(400, features.pitch || 150));
  const hue = (Math.log(p) - Math.log(80)) / (Math.log(400) - Math.log(80)) * 300;
  const brightnessNorm = Math.max(0, Math.min(1, (features.brightness - 0.086) / 0.485));
  const lightness = 0.35 + brightnessNorm * 0.30;
  return chroma.hsl(hue, 0.70, lightness).hex();
}

// ── Expression Mode ───────────────────────────────────────────────────────────
// LAB anchors ported from voice_emotion_color.py
const EMOTION_LAB: Record<string, [number, number, number]> = {
  joy:      [78,  35,  45],
  sadness:  [35, -20, -40],
  anger:    [45,  65,  20],
  fear:     [30,  20, -45],
  disgust:  [45, -35,  15],
  surprise: [70,  25,  30],
  neutral:  [55,   0,   0],
};

export function emotionToLab(scores: Record<string, number>): [number, number, number] {
  let L = 0, a = 0, b = 0;
  for (const [emotion, weight] of Object.entries(scores)) {
    const anchor = EMOTION_LAB[emotion] ?? EMOTION_LAB.neutral;
    L += anchor[0] * weight;
    a += anchor[1] * weight;
    b += anchor[2] * weight;
  }
  return [L, a, b];
}

// Nudges the emotion LAB color toward the person's identity timbre (strength=0.25 keeps emotion dominant).
export function applyTimbreNudge(
  L: number, a: number, b: number,
  identityHex: string,
  strength = 0.25
): [number, number, number] {
  const [ih, , il] = chroma(identityHex).hsl();
  const safeH = isNaN(ih) ? 0 : ih;
  const safeL = isNaN(il) ? 0.5 : il;
  const identityLab = chroma.hsl(safeH, 0.65, safeL).lab();
  return [
    L + (identityLab[0] - 55) * strength,
    a + identityLab[1] * strength,
    b + identityLab[2] * strength,
  ];
}

export function labToHex(L: number, a: number, b: number): string {
  return chroma.lab(
    Math.max(20, Math.min(90, L)),
    Math.max(-80, Math.min(80, a)),
    Math.max(-80, Math.min(80, b))
  ).hex();
}

// Tints an acoustic segment color toward an emotion anchor.
// Keeps the transcript visually coherent with the color ribbon while adding emotional inflection.
export function applyEmotionTint(
  segHex: string,
  scores: Record<string, number>,
  strength = 0.30
): string {
  const [sL, sa, sb] = chroma(segHex).lab();
  const [eL, ea, eb] = emotionToLab(scores);
  return labToHex(
    sL + strength * (eL - sL),
    sa + strength * (ea - sa),
    sb + strength * (eb - sb),
  );
}

// Exponential moving average in LAB space — ported from Python voice_emotion_color.py
export function smoothColor(current: string, target: string, alpha = 0.35): string {
  const [cL, ca, cb] = chroma(current).lab();
  const [tL, ta, tb] = chroma(target).lab();
  return labToHex(
    cL + alpha * (tL - cL),
    ca + alpha * (ta - ca),
    cb + alpha * (tb - cb),
  );
}

// ── Typography — Expression Mode only ────────────────────────────────────────
const EMOTION_TYPOGRAPHY: Record<string, { fontSize: string; textTransform: string }> = {
  joy:      { fontSize: '1.05em', textTransform: 'none' },
  sadness:  { fontSize: '0.92em', textTransform: 'none' },
  anger:    { fontSize: '1.1em',  textTransform: 'uppercase' },
  fear:     { fontSize: '0.88em', textTransform: 'none' },
  disgust:  { fontSize: '1em',    textTransform: 'none' },
  surprise: { fontSize: '1.08em', textTransform: 'none' },
  neutral:  { fontSize: '1em',    textTransform: 'none' },
};

export function expressionTypography(emotion: string): { fontSize: string; textTransform: string } {
  return EMOTION_TYPOGRAPHY[emotion] ?? EMOTION_TYPOGRAPHY.neutral;
}

export const FUNCTION_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'is', 'was', 'are', 'were', 'be', 'have', 'has', 'do',
  'does', 'did', 'will', 'would', 'could', 'should', 'i', 'you', 'he',
  'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them', 'my',
  'your', 'his', 'its', 'our', 'their', 'this', 'that', 'not', 'so',
  'if', 'as', 'by',
]);

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
  if (hexes.length === 0) return DEFAULT_VOICE_HEX;
  if (hexes.length === 1) return hexes[0];
  // Average in oklab for perceptually accurate blending
  const colors = hexes.map((h) => chroma(h).oklab());
  const avg = colors.reduce(
    (acc, [l, a, b]) => [acc[0] + l, acc[1] + a, acc[2] + b],
    [0, 0, 0]
  ).map((v) => v / colors.length) as [number, number, number];
  return chroma.oklab(...avg).hex();
}

export type EmotionResult = {
  color: string;
  fontStyle: "normal" | "italic";
  fontWeight: number;
  textTransform: "none" | "uppercase";
  emotionLabel: string;
};

export function applyEmotion(identityHex: string, f: VoiceFeatures): EmotionResult {
  const shift = (deg: number): string => {
    try { return chroma(identityHex).set("hsl.h", `+${deg}`).hex(); }
    catch { return identityHex; }
  };
  if (f.pitch > 250 && f.energy > 0.5)
    return { color: shift(30), fontStyle: "normal", fontWeight: 600, textTransform: "none", emotionLabel: "Happy" };
  if (f.pitch < 150 && f.energy < 0.3)
    return { color: shift(-30), fontStyle: "italic", fontWeight: 300, textTransform: "none", emotionLabel: "Sad" };
  if (f.energy > 0.7 && f.pitch < 200)
    return { color: shift(-60), fontStyle: "normal", fontWeight: 800, textTransform: "uppercase", emotionLabel: "Intense" };
  if (f.energy < 0.3 && f.pitch > 250)
    return { color: shift(60), fontStyle: "italic", fontWeight: 400, textTransform: "none", emotionLabel: "Nervous" };
  if (f.energy < 0.4 && f.pitch > 150 && f.pitch < 250)
    return { color: shift(15), fontStyle: "italic", fontWeight: 300, textTransform: "none", emotionLabel: "Tender" };
  return { color: identityHex, fontStyle: "normal", fontWeight: 400, textTransform: "none", emotionLabel: "Neutral" };
}
