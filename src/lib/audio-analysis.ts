import { featuresToColor, type VoiceFeatures } from "./voice-color";

// Autocorrelation pitch detection (same algorithm as use-voice-analyzer)
export function autoCorrelate(buf: Float32Array, sampleRate: number): number {
  const SIZE = buf.length;
  let rms = 0;
  for (let i = 0; i < SIZE; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / SIZE);
  if (rms < 0.005) return -1;

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
  if (maxpos <= 0) return -1;

  const x1 = c[maxpos - 1] ?? 0, x2 = c[maxpos], x3 = c[maxpos + 1] ?? 0;
  const a = (x1 + x3 - 2 * x2) / 2;
  const b = (x3 - x1) / 2;
  const T0 = a ? maxpos - b / (2 * a) : maxpos;
  const hz = sampleRate / T0;
  return hz >= 60 && hz <= 800 ? hz : -1;
}

// Analyze a segment of an AudioBuffer → VoiceFeatures → hex color
export function analyzeSegment(buffer: AudioBuffer, startSec: number, endSec: number): VoiceFeatures {
  const sr = buffer.sampleRate;
  const s = Math.floor(startSec * sr);
  const e = Math.min(Math.floor(endSec * sr), buffer.length);
  const samples = buffer.getChannelData(0).slice(s, e);

  if (samples.length < 64) return { pitch: 150, brightness: 0.5, energy: 0.3 };

  // RMS energy
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  const energy = Math.min(1, Math.sqrt(sum / samples.length) * 6);

  // Zero-crossing rate → proxy for spectral brightness (log-scaled, matches use-voice-analyzer)
  let crossings = 0;
  for (let i = 1; i < samples.length; i++)
    if ((samples[i] >= 0) !== (samples[i - 1] >= 0)) crossings++;
  const zcr = (crossings / samples.length) * sr;
  const brightness = Math.min(1, Math.max(0,
    (Math.log(Math.max(zcr, 300)) - Math.log(300)) / (Math.log(8000) - Math.log(300))
  ));

  // Pitch via autocorrelation on up to 2048 samples
  const pitchBuf = samples.slice(0, Math.min(2048, samples.length));
  const detected = autoCorrelate(pitchBuf, sr);
  const pitch = detected > 0 ? detected : 150;

  return { pitch, brightness, energy };
}

export function segmentColor(buffer: AudioBuffer, startSec: number, endSec: number): string {
  return featuresToColor(analyzeSegment(buffer, startSec, endSec));
}
