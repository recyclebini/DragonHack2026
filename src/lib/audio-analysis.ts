import { featuresToColor, type VoiceFeatures } from "./voice-color";

// ── Radix-2 Cooley-Tukey FFT (in-place) ──────────────────────────────────────
function fft(re: Float32Array, im: Float32Array): void {
  const N = re.length;
  // Bit-reversal permutation
  for (let i = 1, j = 0; i < N; i++) {
    let bit = N >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  // Butterfly passes
  for (let len = 2; len <= N; len <<= 1) {
    const ang = (2 * Math.PI) / len;
    const wRe = Math.cos(ang);
    const wIm = -Math.sin(ang);
    for (let i = 0; i < N; i += len) {
      let uRe = 1, uIm = 0;
      const half = len >> 1;
      for (let j = 0; j < half; j++) {
        const lo = i + j, hi = lo + half;
        const vRe = re[hi] * uRe - im[hi] * uIm;
        const vIm = re[hi] * uIm + im[hi] * uRe;
        re[hi] = re[lo] - vRe;
        im[hi] = im[lo] - vIm;
        re[lo] += vRe;
        im[lo] += vIm;
        const nr = uRe * wRe - uIm * wIm;
        uIm = uRe * wIm + uIm * wRe;
        uRe = nr;
      }
    }
  }
}

// FFT-based spectral centroid — replaces ZCR, works correctly for music
function spectralCentroid(samples: Float32Array, sampleRate: number): number {
  // Largest power-of-2 frame that fits the samples, capped at 2048
  let N = 1;
  while (N <= samples.length && N < 2048) N <<= 1;
  if (N > samples.length) N >>= 1;
  if (N < 4) return 1000;

  const re = new Float32Array(N);
  const im = new Float32Array(N);

  // Hann window
  for (let i = 0; i < N; i++) {
    const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (N - 1)));
    re[i] = samples[i] * w;
  }

  fft(re, im);

  // Weighted centroid over magnitude spectrum (positive frequencies only)
  let num = 0, den = 0;
  for (let i = 0; i < N >> 1; i++) {
    const mag = Math.sqrt(re[i] * re[i] + im[i] * im[i]);
    const hz = (i * sampleRate) / N;
    num += hz * mag;
    den += mag;
  }

  return den > 0 ? num / den : 1000;
}

// ── Autocorrelation pitch + HNR ───────────────────────────────────────────────
function autoCorrelateWithClarity(buf: Float32Array, sampleRate: number): { hz: number; clarity: number } {
  const none = { hz: -1, clarity: 0 };
  const SIZE = buf.length;
  let rms = 0;
  for (let i = 0; i < SIZE; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / SIZE);
  if (rms < 0.005) return none;

  let r1 = 0, r2 = SIZE - 1;
  const thres = 0.2;
  for (let i = 0; i < SIZE / 2; i++) if (Math.abs(buf[i]) < thres) { r1 = i; break; }
  for (let i = 1; i < SIZE / 2; i++) if (Math.abs(buf[SIZE - i]) < thres) { r2 = SIZE - i; break; }
  const trimmed = buf.slice(r1, r2);
  const n = trimmed.length;

  const c = new Float32Array(n);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n - i; j++) c[i] += trimmed[j] * trimmed[j + i];

  let d = 0;
  while (c[d] > c[d + 1]) d++;
  let maxval = -1, maxpos = -1;
  for (let i = d; i < n; i++) if (c[i] > maxval) { maxval = c[i]; maxpos = i; }
  if (maxpos <= 0) return none;

  const x1 = c[maxpos - 1] ?? 0, x2 = c[maxpos], x3 = c[maxpos + 1] ?? 0;
  const a = (x1 + x3 - 2 * x2) / 2;
  const b = (x3 - x1) / 2;
  const T0 = a ? maxpos - b / (2 * a) : maxpos;
  const hz = sampleRate / T0;
  if (hz < 60 || hz > 800) return none;
  const clarity = c[0] > 0 ? Math.min(1, maxval / c[0]) : 0;
  return { hz, clarity };
}

export function autoCorrelate(buf: Float32Array, sampleRate: number): number {
  return autoCorrelateWithClarity(buf, sampleRate).hz;
}

// ── Main segment analyzer ─────────────────────────────────────────────────────
export function analyzeSegment(buffer: AudioBuffer, startSec: number, endSec: number): VoiceFeatures {
  const sr = buffer.sampleRate;
  const s = Math.floor(startSec * sr);
  const e = Math.min(Math.floor(endSec * sr), buffer.length);
  const samples = buffer.getChannelData(0).slice(s, e);

  if (samples.length < 64) return { pitch: 150, brightness: 0.5, energy: 0.3, hnr: 0.5 };

  // RMS energy
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  const energy = Math.min(1, Math.sqrt(sum / samples.length) * 6);

  // FFT spectral centroid → brightness (500–4000 Hz range, matches live analyzer)
  const centroidHz = spectralCentroid(samples, sr);
  const brightness = Math.min(1, Math.max(0, (centroidHz - 500) / (4000 - 500)));

  // Pitch + HNR via autocorrelation
  const pitchBuf = samples.slice(0, Math.min(2048, samples.length));
  const { hz, clarity } = autoCorrelateWithClarity(pitchBuf, sr);
  const pitch = hz > 0 ? hz : 150;
  const hnr = clarity;

  return { pitch, brightness, energy, hnr };
}

export function segmentColor(buffer: AudioBuffer, startSec: number, endSec: number): string {
  return featuresToColor(analyzeSegment(buffer, startSec, endSec));
}
