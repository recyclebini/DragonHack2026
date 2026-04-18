import { useCallback, useEffect, useRef, useState } from "react";
import { featuresToColor, type VoiceFeatures } from "@/lib/voice-color";

export type AnalyzerState = "idle" | "listening" | "denied" | "error";

export function useVoiceAnalyzer() {
  const [state, setState] = useState<AnalyzerState>("idle");
  const [color, setColor] = useState<string>("#7a5cff");
  const [features, setFeatures] = useState<VoiceFeatures>({ pitch: 0, brightness: 0.5, energy: 0 });

  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const smoothRef = useRef({ pitch: 150, brightness: 0.5, energy: 0 });

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (ctxRef.current && ctxRef.current.state !== "closed") {
      ctxRef.current.close().catch(() => {});
    }
    ctxRef.current = null;
    analyserRef.current = null;
    setState("idle");
  }, []);

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      ctxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      src.connect(analyser);
      analyserRef.current = analyser;
      setState("listening");
      tick();
    } catch (e) {
      console.error(e);
      setState((e as Error).name === "NotAllowedError" ? "denied" : "error");
    }
  }, []);

  const tick = () => {
    const analyser = analyserRef.current;
    const ctx = ctxRef.current;
    if (!analyser || !ctx) return;

    const bufLen = analyser.fftSize;
    const time = new Float32Array(bufLen);
    const freq = new Uint8Array(analyser.frequencyBinCount);

    const loop = () => {
      analyser.getFloatTimeDomainData(time);
      analyser.getByteFrequencyData(freq);

      // RMS energy
      let sum = 0;
      for (let i = 0; i < time.length; i++) sum += time[i] * time[i];
      const rms = Math.sqrt(sum / time.length);
      const energy = Math.min(1, rms * 6);

      // Spectral centroid (brightness)
      let num = 0;
      let den = 0;
      for (let i = 0; i < freq.length; i++) {
        num += i * freq[i];
        den += freq[i];
      }
      const centroidBin = den > 0 ? num / den : 0;
      const nyquist = ctx.sampleRate / 2;
      const centroidHz = (centroidBin / freq.length) * nyquist;
      // Log scale over 300–8000 Hz spreads voice types evenly (linear scale clips at pink for all speech)
      const brightness = Math.min(1, Math.max(0,
        (Math.log(Math.max(centroidHz, 300)) - Math.log(300)) / (Math.log(8000) - Math.log(300))
      ));

      // Autocorrelation pitch (only if energy is decent)
      let pitch = smoothRef.current.pitch;
      if (energy > 0.04) {
        const detected = autoCorrelate(time, ctx.sampleRate);
        if (detected > 0) pitch = detected;
      }

      // Smoothing
      const s = smoothRef.current;
      s.pitch = s.pitch * 0.7 + pitch * 0.3;
      s.brightness = s.brightness * 0.8 + brightness * 0.2;
      s.energy = s.energy * 0.6 + energy * 0.4;

      const f: VoiceFeatures = { pitch: s.pitch, brightness: s.brightness, energy: s.energy };
      setFeatures(f);
      setColor(featuresToColor(f));

      rafRef.current = requestAnimationFrame(loop);
    };
    loop();
  };

  useEffect(() => () => stop(), [stop]);

  return { state, start, stop, color, features };
}

// Simple autocorrelation (returns Hz or -1)
function autoCorrelate(buf: Float32Array, sampleRate: number): number {
  const SIZE = buf.length;
  let rms = 0;
  for (let i = 0; i < SIZE; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / SIZE);
  if (rms < 0.01) return -1;

  let r1 = 0;
  let r2 = SIZE - 1;
  const thres = 0.2;
  for (let i = 0; i < SIZE / 2; i++) if (Math.abs(buf[i]) < thres) { r1 = i; break; }
  for (let i = 1; i < SIZE / 2; i++) if (Math.abs(buf[SIZE - i]) < thres) { r2 = SIZE - i; break; }
  const trimmed = buf.slice(r1, r2);
  const newSize = trimmed.length;

  const c = new Array(newSize).fill(0);
  for (let i = 0; i < newSize; i++)
    for (let j = 0; j < newSize - i; j++) c[i] = c[i] + trimmed[j] * trimmed[j + i];

  let d = 0;
  while (c[d] > c[d + 1]) d++;
  let maxval = -1;
  let maxpos = -1;
  for (let i = d; i < newSize; i++) {
    if (c[i] > maxval) { maxval = c[i]; maxpos = i; }
  }
  let T0 = maxpos;
  if (T0 <= 0) return -1;
  const x1 = c[T0 - 1] || 0;
  const x2 = c[T0];
  const x3 = c[T0 + 1] || 0;
  const a = (x1 + x3 - 2 * x2) / 2;
  const b = (x3 - x1) / 2;
  if (a) T0 = T0 - b / (2 * a);
  const hz = sampleRate / T0;
  if (hz < 60 || hz > 800) return -1;
  return hz;
}
