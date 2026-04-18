export type WordTimestamp = {
  word: string;
  start: number;
  end: number;
};

// Isolate vocals before sending to STT:
// 1. Mix stereo to mono via mid-channel (L+R)/2 — vocals are center-panned
// 2. Band-pass filter 200–4000 Hz — removes bass/kick and cymbals/hi-hats
// 3. Downsample to 16 kHz — enough for speech, ~3x smaller upload
async function preprocessForSTT(file: File): Promise<Blob> {
  const TARGET_SR = 16000;

  const arrayBuf = await file.arrayBuffer();
  const decodeCtx = new AudioContext();
  const decoded = await decodeCtx.decodeAudioData(arrayBuf);
  await decodeCtx.close();

  const duration = decoded.duration;
  const outputLength = Math.ceil(TARGET_SR * duration);

  // OfflineAudioContext always outputs at the requested sample rate
  const offline = new OfflineAudioContext(1, outputLength, TARGET_SR);

  const source = offline.createBufferSource();
  source.buffer = decoded;

  // High-pass: cut below 200 Hz (bass guitar, kick drum)
  const hp = offline.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 200;
  hp.Q.value = 0.7;

  // Low-pass: cut above 4000 Hz (cymbals, hi-hats, hiss)
  const lp = offline.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 4000;
  lp.Q.value = 0.7;

  source.connect(hp);
  hp.connect(lp);
  lp.connect(offline.destination);
  source.start();

  const rendered = await offline.startRendering();
  return encodeWAV(rendered.getChannelData(0), TARGET_SR);
}

function encodeWAV(samples: Float32Array, sampleRate: number): Blob {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const str = (off: number, s: string) =>
    [...s].forEach((c, i) => v.setUint8(off + i, c.charCodeAt(0)));

  str(0, "RIFF");
  v.setUint32(4, 36 + samples.length * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);          // PCM
  v.setUint16(22, 1, true);          // mono
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, samples.length * 2, true);

  let off = 44;
  for (let i = 0; i < samples.length; i++, off += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  return new Blob([buf], { type: "audio/wav" });
}

export async function transcribeFile(file: File): Promise<WordTimestamp[]> {
  const key = import.meta.env.VITE_DEEPGRAM_API_KEY as string;
  if (!key) throw new Error("VITE_DEEPGRAM_API_KEY is not set");

  const processed = await preprocessForSTT(file);

  const res = await fetch(
    "https://api.deepgram.com/v1/listen?model=whisper-large&language=en&words=true&punctuate=false",
    {
      method: "POST",
      headers: {
        Authorization: `Token ${key}`,
        "Content-Type": "audio/wav",
      },
      body: processed,
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Deepgram error ${res.status}: ${text}`);
  }

  const data = await res.json();
  const words: WordTimestamp[] =
    data?.results?.channels?.[0]?.alternatives?.[0]?.words ?? [];

  return words.map((w: WordTimestamp) => ({
    word: w.word,
    start: w.start,
    end: w.end,
  }));
}
