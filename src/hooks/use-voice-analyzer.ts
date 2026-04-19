import { useCallback, useEffect, useRef, useState } from "react";
import { featuresToColor, groupColor, type VoiceFeatures } from "@/lib/voice-color";


export type AnalyzerState = "idle" | "listening" | "denied" | "error";

export function useVoiceAnalyzer() {
  const [state, setState] = useState<AnalyzerState>("idle");
  const [color, setColor] = useState<string>("#7a5cff");
  const [features, setFeatures] = useState<VoiceFeatures>({ pitch: 0, brightness: 0.5, energy: 0, hnr: 0.5 });

  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const smoothRef = useRef({ pitch: 150, brightness: 0.5, energy: 0, hnr: 0.5 });
  const samplesRef = useRef<VoiceFeatures[]>([]);
  const recentColorsRef = useRef<string[]>([]);
  const sampleIntervalRef = useRef<number | null>(null);

  const stop = useCallback((): VoiceFeatures[] => {
    if (sampleIntervalRef.current !== null) {
      clearInterval(sampleIntervalRef.current);
      sampleIntervalRef.current = null;
    }
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
    const collected = [...samplesRef.current];
    samplesRef.current = [];
    return collected;
  }, []);

  const start = useCallback(async (externalStream?: MediaStream) => {
    samplesRef.current = [];
    recentColorsRef.current = [];
    if (sampleIntervalRef.current !== null) {
      clearInterval(sampleIntervalRef.current);
      sampleIntervalRef.current = null;
    }
    try {
      const stream = externalStream ?? await navigator.mediaDevices.getUserMedia({
        audio: {
          noiseSuppression: true,
          echoCancellation: true,
          autoGainControl: false,
        },
      });
      // Only take ownership (and stop tracks on cleanup) if we created the stream
      if (!externalStream) streamRef.current = stream;
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      ctxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);

      // Soft noise gate: compressor reduces quiet noise floor without touching loud speech
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -50;
      compressor.knee.value = 20;
      compressor.ratio.value = 8;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.25;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      src.connect(compressor);
      compressor.connect(analyser);
      analyserRef.current = analyser;
      setState("listening");
      sampleIntervalRef.current = window.setInterval(() => {
        const f = smoothRef.current;
        samplesRef.current.push({ pitch: f.pitch, brightness: f.brightness, energy: f.energy, hnr: f.hnr });
      }, 200);
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

      let sum = 0;
      for (let i = 0; i < time.length; i++) sum += time[i] * time[i];
      const rms = Math.sqrt(sum / time.length);
      const energy = Math.min(1, rms * 6);

      let num = 0;
      let den = 0;
      for (let i = 0; i < freq.length; i++) {
        num += i * freq[i];
        den += freq[i];
      }
      const centroidBin = den > 0 ? num / den : 0;
      const nyquist = ctx.sampleRate / 2;
      const centroidHz = (centroidBin / freq.length) * nyquist;
      const brightness = Math.min(1, Math.max(0, (centroidHz - 500) / (4000 - 500)));

      let pitch = smoothRef.current.pitch;
      let hnr = 0;
      if (energy > 0.04) {
        const { hz, clarity } = autoCorrelate(time, ctx.sampleRate);
        if (hz > 0) { pitch = hz; hnr = clarity; }
      }

      const s = smoothRef.current;
      s.pitch = s.pitch * 0.7 + pitch * 0.3;
      s.brightness = s.brightness * 0.8 + brightness * 0.2;
      s.energy = s.energy * 0.6 + energy * 0.4;
      s.hnr = s.hnr * 0.7 + hnr * 0.3;

      const f: VoiceFeatures = { pitch: s.pitch, brightness: s.brightness, energy: s.energy, hnr: s.hnr };
      setFeatures(f);
      const rawColor = featuresToColor(f);
      recentColorsRef.current.push(rawColor);
      if (recentColorsRef.current.length > 10) recentColorsRef.current.shift();
      const liveColor = recentColorsRef.current.length >= 2
        ? groupColor(recentColorsRef.current)
        : rawColor;
      setColor(liveColor);

      rafRef.current = requestAnimationFrame(loop);
    };
    loop();
  };

  useEffect(() => () => { stop(); }, [stop]);

  return { state, start, stop, color, features };
}

function autoCorrelate(buf: Float32Array, sampleRate: number): { hz: number; clarity: number } {
  const none = { hz: -1, clarity: 0 };
  const SIZE = buf.length;
  let rms = 0;
  for (let i = 0; i < SIZE; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / SIZE);
  if (rms < 0.01) return none;

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
  if (T0 <= 0) return none;
  const x1 = c[T0 - 1] || 0;
  const x2 = c[T0];
  const x3 = c[T0 + 1] || 0;
  const a = (x1 + x3 - 2 * x2) / 2;
  const b = (x3 - x1) / 2;
  if (a) T0 = T0 - b / (2 * a);
  const hz = sampleRate / T0;
  if (hz < 60 || hz > 800) return none;
  const clarity = c[0] > 0 ? Math.min(1, maxval / c[0]) : 0;
  return { hz, clarity };
}
