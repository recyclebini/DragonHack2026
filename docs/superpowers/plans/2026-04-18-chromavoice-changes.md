# Chromavoice Changes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two-layer color system (identity + emotion), remove lyrics page, add /conversation, /visualize, and /music routes, and clean up Android/Capacitor files.

**Architecture:** Foundation changes (applyEmotion, samples) land first since all three new routes depend on them. New routes are TanStack Router file-based — creating the file is enough for auto-discovery. Each task is independently committable.

**Tech Stack:** React 19, TanStack Router (file-based), chroma-js, Web Audio API, canvas API, existing audio-analysis.ts for /music chunk processing.

---

## File Map

**Modified:**
- `src/lib/voice-color.ts` — add `EmotionResult` type + `applyEmotion()`
- `src/hooks/use-voice-analyzer.ts` — add samples collection; `stop()` returns `string[]`
- `src/routes/index.tsx` — use `groupColor(samples)` for identity hex; add subtitle
- `src/components/SiteHeader.tsx` — remove Lyrics; add Conversation/Visualize/Music with `mobileLabel`

**Deleted:**
- `src/routes/lyrics.tsx`
- `android/` directory, `mobile/` directory, `capacitor.config.ts`

**Created:**
- `src/routes/conversation.tsx`
- `src/routes/visualize.tsx`
- `src/routes/music.tsx`

---

## Task 1: Add `applyEmotion` to voice-color.ts

**Files:**
- Modify: `src/lib/voice-color.ts`

- [ ] **Step 1: Add EmotionResult type and applyEmotion function**

Append to the end of `src/lib/voice-color.ts`:

```typescript
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
```

- [ ] **Step 2: Verify TypeScript**

Run: `npx tsc --noEmit`
Expected: no errors in voice-color.ts

- [ ] **Step 3: Commit**

```bash
git add src/lib/voice-color.ts
git commit -m "feat: add applyEmotion() and EmotionResult type to voice-color"
```

---

## Task 2: Add samples collection to use-voice-analyzer.ts

**Files:**
- Modify: `src/hooks/use-voice-analyzer.ts`

- [ ] **Step 1: Add refs and modify stop() to return collected samples**

Replace the entire `useVoiceAnalyzer` function body. The full updated file:

```typescript
import { useCallback, useEffect, useRef, useState } from "react";
import { featuresToColor, type VoiceFeatures } from "@/lib/voice-color";

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
  const samplesRef = useRef<string[]>([]);
  const sampleIntervalRef = useRef<number | null>(null);

  const stop = useCallback((): string[] => {
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

  const start = useCallback(async () => {
    samplesRef.current = [];
    if (sampleIntervalRef.current !== null) {
      clearInterval(sampleIntervalRef.current);
      sampleIntervalRef.current = null;
    }
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
      sampleIntervalRef.current = window.setInterval(() => {
        const f = smoothRef.current;
        samplesRef.current.push(
          featuresToColor({ pitch: f.pitch, brightness: f.brightness, energy: f.energy, hnr: f.hnr })
        );
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
      setColor(featuresToColor(f));

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
```

- [ ] **Step 2: Verify TypeScript**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/hooks/use-voice-analyzer.ts
git commit -m "feat: collect identity color samples in useVoiceAnalyzer, stop() returns samples"
```

---

## Task 3: Update Record page for identity color and subtitle

**Files:**
- Modify: `src/routes/index.tsx`

- [ ] **Step 1: Import groupColor and update handleStop**

Change the import line:
```typescript
import { describeVoice, groupColor } from "@/lib/voice-color";
```

Replace `handleStop`:
```typescript
const handleStop = () => {
  const collected = stop();
  const hex = collected.length > 1 ? groupColor(collected) : color;
  setLocked(hex);
};
```

- [ ] **Step 2: Add subtitle under color name in locked state**

In the locked section, find the block starting with `<div className="text-center space-y-1">` and add a subtitle line after `<p className="font-mono text-sm">{desc.hex.toUpperCase()}</p>`:

```tsx
<p className="font-serif text-sm text-muted-foreground/70 mt-2 italic text-balance">
  This is your color — stable, personal, yours. However you speak, this is who you are.
</p>
```

- [ ] **Step 3: Verify TypeScript**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/routes/index.tsx
git commit -m "feat: use grouped identity color on lock, add stable-color subtitle"
```

---

## Task 4: Remove lyrics page and update SiteHeader

**Files:**
- Delete: `src/routes/lyrics.tsx`
- Modify: `src/components/SiteHeader.tsx`

- [ ] **Step 1: Delete lyrics route**

```bash
rm src/routes/lyrics.tsx
```

- [ ] **Step 2: Replace SiteHeader.tsx**

Full replacement of `src/components/SiteHeader.tsx`:

```typescript
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { LogIn, LogOut, User, Mic, Map, MessageSquare, Eye, Music } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { AuthModal } from "@/components/AuthModal";
import { Button } from "@/components/ui/button";

const links = [
  { to: "/", label: "Record", mobileLabel: "Record", icon: Mic },
  { to: "/map", label: "Voice Map", mobileLabel: "Map", icon: Map },
  { to: "/conversation", label: "Conversation", mobileLabel: "Chat", icon: MessageSquare },
  { to: "/visualize", label: "Visualize", mobileLabel: "Visual", icon: Eye },
  { to: "/music", label: "Music", mobileLabel: "Music", icon: Music },
] as const;

export function SiteHeader() {
  const { user, loading, signOut } = useAuth();
  const [showAuth, setShowAuth] = useState(false);

  return (
    <>
      {/* ── desktop / tablet top bar ── */}
      <header className="sticky top-0 z-50">
        <div className="mx-auto max-w-6xl px-5 py-4">
          <div className="glass rounded-full px-5 py-3 flex items-center justify-between">
            <Link to="/" className="font-display font-semibold tracking-tight text-lg">
              <span className="bg-gradient-to-r from-[oklch(0.85_0.15_30)] via-[oklch(0.8_0.18_180)] to-[oklch(0.78_0.18_320)] bg-clip-text text-transparent">
                Chromavoice
              </span>
            </Link>
            <nav className="hidden md:flex items-center gap-1 text-sm">
              {links.map((l) => (
                <Link
                  key={l.to}
                  to={l.to}
                  activeOptions={{ exact: true }}
                  className="px-3 py-1.5 rounded-full text-muted-foreground hover:text-foreground transition-colors data-[status=active]:bg-white/10 data-[status=active]:text-foreground"
                >
                  {l.label}
                </Link>
              ))}
              {!loading && (
                user ? (
                  <div className="flex items-center gap-2 ml-2">
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <User className="size-3" />
                      {user.email?.split("@")[0]}
                    </span>
                    <Button variant="ghost" size="sm" className="rounded-full h-8 px-3 text-xs" onClick={() => signOut()}>
                      <LogOut className="size-3" />
                    </Button>
                  </div>
                ) : (
                  <Button variant="ghost" size="sm" className="rounded-full h-8 px-3 text-xs ml-2 glass" onClick={() => setShowAuth(true)}>
                    <LogIn className="size-3" />
                    Sign in
                  </Button>
                )
              )}
            </nav>

            {/* mobile: just auth button in top bar */}
            <div className="flex md:hidden items-center gap-2">
              {!loading && (
                user ? (
                  <Button variant="ghost" size="sm" className="rounded-full h-8 px-3 text-xs" onClick={() => signOut()}>
                    <User className="size-3 mr-1" />
                    {user.email?.split("@")[0]}
                    <LogOut className="size-3 ml-1" />
                  </Button>
                ) : (
                  <Button variant="ghost" size="sm" className="rounded-full h-8 px-3 text-xs glass" onClick={() => setShowAuth(true)}>
                    <LogIn className="size-3" />
                    Sign in
                  </Button>
                )
              )}
            </div>
          </div>
        </div>
      </header>

      {/* ── mobile bottom tab bar ── */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 pb-safe">
        <div className="mx-4 mb-4">
          <div className="glass rounded-2xl px-1 py-2 flex items-center justify-around">
            {links.map((l) => {
              const Icon = l.icon;
              return (
                <Link
                  key={l.to}
                  to={l.to}
                  activeOptions={{ exact: true }}
                  className="flex flex-col items-center gap-0.5 px-2 py-2 rounded-xl text-muted-foreground transition-colors data-[status=active]:bg-white/10 data-[status=active]:text-foreground"
                >
                  <Icon className="size-5" />
                  <span className="text-[9px] font-medium">{l.mobileLabel}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </nav>

      <AuthModal open={showAuth} onClose={() => setShowAuth(false)} />
    </>
  );
}
```

- [ ] **Step 3: Verify TypeScript**

Run: `npx tsc --noEmit`
Expected: no errors (TanStack Router will flag unknown routes until `npm run dev` regenerates routeTree.gen.ts — that's expected here; run `npm run dev` briefly to regenerate, then re-check)

- [ ] **Step 4: Commit**

```bash
git add src/components/SiteHeader.tsx
git commit -m "feat: update nav — remove Lyrics, add Conversation/Visualize/Music"
```

---

## Task 5: Create /conversation route

**Files:**
- Create: `src/routes/conversation.tsx`

- [ ] **Step 1: Create the file**

Create `src/routes/conversation.tsx`:

```typescript
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import chroma from "chroma-js";
import { SiteHeader } from "@/components/SiteHeader";
import { useVoiceAnalyzer } from "@/hooks/use-voice-analyzer";
import { applyEmotion, type EmotionResult } from "@/lib/voice-color";
import { getVoices, type SavedVoice } from "@/lib/voice-store";

export const Route = createFileRoute("/conversation")({
  component: ConversationPage,
});

type Slot = { name: string; identityHex: string | null };
type Entry = {
  slotIndex: number;
  speakerName: string;
  speakerColor: string;
  text: string;
  emotion: EmotionResult;
};

const AUTO_HUES = [30, 120, 210, 300];

function slotColor(slot: Slot, index: number): string {
  return slot.identityHex ?? chroma.hsl(AUTO_HUES[index], 0.6, 0.55).hex();
}

function ConversationPage() {
  const [slots, setSlots] = useState<Slot[]>([
    { name: "", identityHex: null },
    { name: "", identityHex: null },
    { name: "", identityHex: null },
    { name: "", identityHex: null },
  ]);
  const [activeSlot, setActiveSlot] = useState(0);
  const [text, setText] = useState("");
  const [transcript, setTranscript] = useState<Entry[]>([]);
  const [savedVoices, setSavedVoices] = useState<SavedVoice[]>([]);
  const [pickerForSlot, setPickerForSlot] = useState<number | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const { state, start, stop, features } = useVoiceAnalyzer();

  useEffect(() => { getVoices().then(setSavedVoices); }, []);

  useEffect(() => {
    if (transcriptRef.current)
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
  }, [transcript]);

  const activeColor = slotColor(slots[activeSlot], activeSlot);
  const emotion = applyEmotion(activeColor, features);

  const handleAddLine = () => {
    if (!text.trim()) return;
    setTranscript((prev) => [
      ...prev,
      {
        slotIndex: activeSlot,
        speakerName: slots[activeSlot].name || `Speaker ${activeSlot + 1}`,
        speakerColor: activeColor,
        text: text.trim(),
        emotion: applyEmotion(activeColor, features),
      },
    ]);
    setText("");
  };

  const assignVoice = (slotIdx: number, voice: SavedVoice) => {
    setSlots((prev) =>
      prev.map((s, i) => i === slotIdx ? { name: voice.name, identityHex: voice.hex } : s)
    );
    setPickerForSlot(null);
  };

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 pt-6 pb-32 md:pb-8">
        <h1 className="font-display text-3xl font-semibold mb-2">Conversation</h1>
        <p className="text-muted-foreground text-sm mb-6">
          See who is speaking and how they feel — in color.
        </p>

        {/* Speaker slots */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {slots.map((slot, i) => {
            const c = slotColor(slot, i);
            return (
              <div key={i} className="glass rounded-2xl p-3 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ background: c }} />
                  <input
                    value={slot.name}
                    onChange={(e) =>
                      setSlots((prev) =>
                        prev.map((s, idx) => idx === i ? { ...s, name: e.target.value } : s)
                      )
                    }
                    placeholder={`Speaker ${i + 1}`}
                    className="bg-transparent text-sm flex-1 min-w-0 outline-none placeholder:text-muted-foreground"
                  />
                </div>
                <button
                  onClick={() => setPickerForSlot(pickerForSlot === i ? null : i)}
                  className="text-[10px] text-muted-foreground hover:text-foreground transition text-left"
                >
                  {slot.identityHex ? "Change voice ↓" : "Pick from map →"}
                </button>
                {pickerForSlot === i && (
                  <div className="mt-1 space-y-1 max-h-32 overflow-y-auto">
                    {savedVoices.length === 0 ? (
                      <p className="text-[10px] text-muted-foreground">No saved voices yet.</p>
                    ) : (
                      savedVoices.map((v) => (
                        <button
                          key={v.id}
                          onClick={() => assignVoice(i, v)}
                          className="flex items-center gap-2 w-full text-left text-xs hover:bg-white/10 rounded px-2 py-1"
                        >
                          <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: v.hex }} />
                          {v.name}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Active speaker + mic toggle */}
        <div className="flex flex-wrap gap-2 mb-3">
          {slots.map((slot, i) => {
            const c = slotColor(slot, i);
            const isActive = activeSlot === i;
            return (
              <button
                key={i}
                onClick={() => setActiveSlot(i)}
                className="px-4 py-2 rounded-full text-sm font-medium transition-all"
                style={{
                  background: isActive ? c : `${c}22`,
                  color: isActive ? "#0d0d0d" : c,
                  boxShadow: isActive ? `0 0 20px ${c}55` : "none",
                  border: `1.5px solid ${c}`,
                }}
              >
                {slot.name || `Speaker ${i + 1}`}
              </button>
            );
          })}
        </div>

        {/* Live emotion indicator */}
        <div
          className="mb-4 px-4 py-2 glass rounded-xl flex items-center gap-3"
          style={{ borderLeft: `3px solid ${emotion.color}` }}
        >
          <span
            className="text-sm"
            style={{
              color: emotion.color,
              fontStyle: emotion.fontStyle,
              fontWeight: emotion.fontWeight,
              textTransform: emotion.textTransform,
            }}
          >
            {emotion.emotionLabel}
          </span>
          <span className="text-muted-foreground text-xs">
            {state === "listening" ? "Live mic active" : "Mic off"}
          </span>
          <button
            onClick={() => state === "listening" ? stop() : start()}
            className="ml-auto text-xs px-3 py-1 rounded-full glass hover:bg-white/10 transition"
          >
            {state === "listening" ? "Stop mic" : "Start mic"}
          </button>
        </div>

        {/* Transcript */}
        <div
          ref={transcriptRef}
          className="glass rounded-2xl p-4 min-h-[180px] max-h-[40vh] overflow-y-auto mb-4 space-y-3"
        >
          {transcript.length === 0 && (
            <p className="text-muted-foreground text-sm text-center mt-8">
              Transcript will appear here.
            </p>
          )}
          {transcript.map((entry, idx) => (
            <div key={idx} className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span
                  className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                  style={{ background: `${entry.speakerColor}33`, color: entry.speakerColor }}
                >
                  {entry.speakerName}
                </span>
                <span
                  className="text-[10px] px-2 py-0.5 rounded-full glass"
                  style={{ color: entry.emotion.color }}
                >
                  {entry.emotion.emotionLabel}
                </span>
              </div>
              <p
                className="text-base pl-1"
                style={{
                  color: entry.emotion.color,
                  fontStyle: entry.emotion.fontStyle,
                  fontWeight: entry.emotion.fontWeight,
                  textTransform: entry.emotion.textTransform,
                }}
              >
                {entry.text}
              </p>
            </div>
          ))}
        </div>

        {/* Input row */}
        <div className="flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddLine()}
            placeholder="Type what's being said…"
            className="flex-1 bg-transparent glass rounded-xl px-4 py-3 text-sm outline-none placeholder:text-muted-foreground border border-white/10"
          />
          <button
            onClick={handleAddLine}
            disabled={!text.trim()}
            className="px-5 py-3 rounded-xl text-sm font-medium transition-all disabled:opacity-40"
            style={{ background: activeColor, color: "#0d0d0d" }}
          >
            Add line
          </button>
        </div>

        {/* Legend */}
        <div className="mt-5 flex flex-wrap gap-3 items-center">
          <span className="text-xs text-muted-foreground">Speakers:</span>
          {slots.map((slot, i) => {
            const c = slotColor(slot, i);
            return (
              <div key={i} className="flex items-center gap-1.5 text-xs">
                <span className="w-3 h-3 rounded-full" style={{ background: c }} />
                {slot.name || `Speaker ${i + 1}`}
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

Run: `npx tsc --noEmit`
Expected: no errors (after `npm run dev` generates route types)

- [ ] **Step 3: Commit**

```bash
git add src/routes/conversation.tsx
git commit -m "feat: add /conversation route for deaf-accessible real-time dialogue"
```

---

## Task 6: Create /visualize route

**Files:**
- Create: `src/routes/visualize.tsx`

- [ ] **Step 1: Create the file**

Create `src/routes/visualize.tsx`:

```typescript
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { Link } from "@tanstack/react-router";
import { useVoiceAnalyzer } from "@/hooks/use-voice-analyzer";
import { applyEmotion, featuresToColor } from "@/lib/voice-color";
import type { VoiceFeatures } from "@/lib/voice-color";

export const Route = createFileRoute("/visualize")({
  component: VisualizePage,
});

type Ring = { x: number; y: number; maxR: number; color: string; startTime: number };
type Dot  = { x: number; y: number; r: number; color: string; startTime: number };

function VisualizePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { state, start, stop, color, features } = useVoiceAnalyzer();

  // Keep live values accessible in the rAF loop without stale closures
  const colorRef    = useRef<string>(color);
  const featuresRef = useRef<VoiceFeatures>(features);
  const ringsRef    = useRef<Ring[]>([]);
  const dotsRef     = useRef<Dot[]>([]);
  const prevEnergyRef = useRef(0);
  const melodyRef   = useRef<number[]>([]);

  useEffect(() => { colorRef.current = color; }, [color]);
  useEffect(() => { featuresRef.current = features; }, [features]);

  // Canvas draw loop — runs once, reads from refs every frame
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const ctx = canvas.getContext("2d")!;
    let raf = 0;

    const draw = (timestamp: number) => {
      const w = canvas.width;
      const h = canvas.height;
      const hex = colorRef.current;
      const f   = featuresRef.current;
      const emotion = applyEmotion(hex, f);

      // Slow background fade toward current color
      ctx.globalAlpha = 0.04;
      ctx.fillStyle = hex;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;

      // Melody thread — normalized pitch → y position
      const pitchNorm = Math.max(0, Math.min(1, ((f.pitch || 150) - 60) / (800 - 60)));
      const targetY = h * (0.85 - pitchNorm * 0.7);
      melodyRef.current.push(targetY);
      if (melodyRef.current.length > w) melodyRef.current.shift();

      const pts = melodyRef.current;
      if (pts.length > 1) {
        ctx.beginPath();
        const startX = Math.max(0, w - pts.length);
        for (let i = 0; i < pts.length; i++) {
          if (i === 0) ctx.moveTo(startX + i, pts[i]);
          else         ctx.lineTo(startX + i, pts[i]);
        }
        ctx.strokeStyle = hex;
        ctx.lineWidth   = 1.5;
        ctx.globalAlpha = 0.7;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // Energy spike → ring + dot
      const delta = Math.abs(f.energy - prevEnergyRef.current);
      if (delta > 0.25) {
        ringsRef.current.push({ x: w / 2, y: h / 2, maxR: Math.min(w, h) * 0.4, color: hex, startTime: timestamp });
        dotsRef.current.push({
          x: Math.random() * w, y: Math.random() * h,
          r: 4 + Math.random() * 4,
          color: emotion.color,
          startTime: timestamp,
        });
      }
      prevEnergyRef.current = f.energy;

      // Rings — expand and fade over 800ms
      ringsRef.current = ringsRef.current.filter((ring) => {
        const age = timestamp - ring.startTime;
        if (age > 800) return false;
        const t   = age / 800;
        const r   = 10 + (ring.maxR - 10) * t;
        ctx.beginPath();
        ctx.arc(ring.x, ring.y, r, 0, Math.PI * 2);
        ctx.strokeStyle  = ring.color;
        ctx.lineWidth    = 2;
        ctx.globalAlpha  = (1 - t) * 0.6;
        ctx.stroke();
        ctx.globalAlpha  = 1;
        return true;
      });

      // Dots — fade over 500ms
      dotsRef.current = dotsRef.current.filter((dot) => {
        const age = timestamp - dot.startTime;
        if (age > 500) return false;
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, dot.r, 0, Math.PI * 2);
        ctx.fillStyle   = dot.color;
        ctx.globalAlpha = 1 - age / 500;
        ctx.fill();
        ctx.globalAlpha = 1;
        return true;
      });

      // Emotion label — top-left
      ctx.font      = "italic 48px 'Instrument Serif', Georgia, serif";
      ctx.fillStyle = emotion.color;
      ctx.globalAlpha = 0.9;
      ctx.fillText(emotion.emotionLabel, 24, 64);

      // Hex — top-right
      const hexText = hex.toUpperCase();
      ctx.font      = "14px monospace";
      ctx.fillStyle = "#ffffff";
      ctx.globalAlpha = 0.5;
      const tw = ctx.measureText(hexText).width;
      ctx.fillText(hexText, w - tw - 24, 32);
      ctx.globalAlpha = 1;

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  const handleToggle = () => {
    if (state === "listening") {
      stop();
    } else {
      const canvas = canvasRef.current;
      if (canvas) canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height);
      melodyRef.current = [];
      ringsRef.current  = [];
      dotsRef.current   = [];
      prevEnergyRef.current = 0;
      start();
    }
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#0d0d0d]">
      <canvas ref={canvasRef} className="absolute inset-0" />

      <Link
        to="/"
        className="absolute top-4 left-4 z-10 text-white/40 hover:text-white/80 text-xs font-mono transition"
      >
        ← Chromavoice
      </Link>

      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10">
        <button
          onClick={handleToggle}
          className="px-8 py-3 rounded-full glass text-sm font-medium transition-all"
          style={{ boxShadow: state === "listening" ? `0 0 30px ${color}66` : "none" }}
        >
          {state === "listening" ? "Stop" : "Start"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/routes/visualize.tsx
git commit -m "feat: add /visualize route — full-screen canvas voice visualization"
```

---

## Task 7: Create /music route

**Files:**
- Create: `src/routes/music.tsx`

- [ ] **Step 1: Create the file**

Create `src/routes/music.tsx`:

```typescript
import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { analyzeSegment } from "@/lib/audio-analysis";
import { featuresToColor, applyEmotion, groupColor, nameForColor, poemForColor } from "@/lib/voice-color";

export const Route = createFileRoute("/music")({
  component: MusicPage,
});

type Segment = { time: number; color: string; emotionLabel: string; energy: number };

const CHUNK = 0.2;   // seconds per analysis window
const BATCH = 50;    // chunks per setTimeout batch

const FMT = (s: number) =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

function MusicPage() {
  const [segments, setSegments]     = useState<Segment[]>([]);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress]     = useState(0);
  const [audioUrl, setAudioUrl]     = useState<string | null>(null);
  const [duration, setDuration]     = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [dragging, setDragging]     = useState(false);
  const [hoverInfo, setHoverInfo]   = useState<{ x: number; label: string } | null>(null);
  const audioRef   = useRef<HTMLAudioElement>(null);
  const ribbonRef  = useRef<HTMLDivElement>(null);

  const processFile = async (file: File) => {
    if (!/\.(mp3|wav|ogg|flac|aac|m4a)$/i.test(file.name)) {
      alert("Unsupported format. Please use MP3, WAV, OGG, FLAC, or AAC.");
      return;
    }
    setProcessing(true);
    setProgress(0);
    setSegments([]);
    setAudioUrl(null);
    setCurrentTime(0);

    const arrayBuffer = await file.arrayBuffer();
    const actx = new AudioContext();
    let decoded: AudioBuffer;
    try {
      decoded = await actx.decodeAudioData(arrayBuffer);
    } catch {
      alert("Could not decode this audio file.");
      setProcessing(false);
      await actx.close();
      return;
    }

    const totalChunks = Math.ceil(decoded.duration / CHUNK);
    const result: Segment[] = [];

    const processBatch = (fromChunk: number) => {
      const toChunk = Math.min(fromChunk + BATCH, totalChunks);
      for (let i = fromChunk; i < toChunk; i++) {
        const startSec = i * CHUNK;
        const endSec   = Math.min(startSec + CHUNK, decoded.duration);
        const features = analyzeSegment(decoded, startSec, endSec);
        const color    = featuresToColor(features);
        const { emotionLabel } = applyEmotion(color, features);
        result.push({ time: startSec, color, emotionLabel, energy: features.energy });
      }
      setProgress(Math.round((toChunk / totalChunks) * 100));
      if (toChunk < totalChunks) {
        setTimeout(() => processBatch(toChunk), 0);
      } else {
        setSegments(result);
        setDuration(decoded.duration);
        setProcessing(false);
        setAudioUrl(URL.createObjectURL(file));
        actx.close();
      }
    };

    processBatch(0);
  };

  const emotionArc = () => {
    if (!segments.length) return [];
    const BLOCK = 10;
    return Array.from({ length: Math.ceil(duration / BLOCK) }, (_, b) => {
      const start = b * BLOCK;
      const end   = Math.min(start + BLOCK, duration);
      const counts: Record<string, number> = {};
      segments
        .filter((s) => s.time >= start && s.time < end)
        .forEach((s) => { counts[s.emotionLabel] = (counts[s.emotionLabel] ?? 0) + 1; });
      const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Neutral";
      return { start, end, dominant };
    });
  };

  const soulHex = segments.length ? groupColor(segments.map((s) => s.color)) : null;
  const playheadPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 pt-6 pb-32 md:pb-8">
        <h1 className="font-display text-3xl font-semibold mb-2">Music</h1>
        <p className="text-muted-foreground mb-8 text-sm">Upload a track to see its emotional color journey.</p>

        {/* Upload */}
        {!segments.length && !processing && (
          <label
            className={`flex flex-col items-center justify-center w-full h-48 rounded-2xl glass border-2 border-dashed transition-all cursor-pointer ${dragging ? "border-white/50 bg-white/10" : "border-white/20 hover:border-white/40"}`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) processFile(f); }}
          >
            <p className="font-display text-lg mb-1">Drop audio file here</p>
            <p className="text-sm text-muted-foreground">MP3 · WAV · OGG · FLAC · AAC</p>
            <input type="file" accept=".mp3,.wav,.ogg,.flac,.aac" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) processFile(f); }} />
          </label>
        )}

        {/* Progress */}
        {processing && (
          <div className="flex flex-col items-center gap-4 py-12">
            <p className="text-sm text-muted-foreground">Analyzing… {progress}%</p>
            <div className="w-full max-w-sm h-2 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        {/* Results */}
        {!!segments.length && (
          <div className="space-y-10">
            {/* Color ribbon */}
            <div>
              <h2 className="font-display text-lg mb-2">Color Journey</h2>
              <div
                ref={ribbonRef}
                className="relative w-full h-12 rounded-xl overflow-visible cursor-crosshair"
                onMouseMove={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const pct  = (e.clientX - rect.left) / rect.width;
                  const t    = pct * duration;
                  const idx  = Math.min(Math.floor(t / CHUNK), segments.length - 1);
                  const seg  = segments[idx];
                  if (seg) setHoverInfo({ x: e.clientX - rect.left, label: `${FMT(seg.time)} · ${seg.emotionLabel}` });
                }}
                onMouseLeave={() => setHoverInfo(null)}
              >
                <div className="flex h-12 w-full rounded-xl overflow-hidden">
                  {segments.map((seg, i) => (
                    <div key={i} style={{ background: seg.color, flex: 1, minWidth: 1 }} />
                  ))}
                </div>
                {audioUrl && (
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-white/80 pointer-events-none"
                    style={{ left: `${playheadPct}%` }}
                  />
                )}
                {hoverInfo && (
                  <div
                    className="absolute top-full mt-1 px-2 py-1 text-xs glass rounded pointer-events-none whitespace-nowrap z-10"
                    style={{ left: Math.min(hoverInfo.x, (ribbonRef.current?.clientWidth ?? 400) - 140) }}
                  >
                    {hoverInfo.label}
                  </div>
                )}
              </div>
            </div>

            {/* Energy bars */}
            <div>
              <h2 className="font-display text-lg mb-2">Energy</h2>
              <div className="flex items-end h-16 w-full gap-px rounded-xl overflow-hidden">
                {segments.map((seg, i) => (
                  <div
                    key={i}
                    style={{ height: `${Math.max(4, seg.energy * 100)}%`, background: seg.color, flex: 1, minWidth: 1 }}
                  />
                ))}
              </div>
            </div>

            {/* Emotion arc */}
            <div>
              <h2 className="font-display text-lg mb-3">Emotion Arc</h2>
              <div className="space-y-1.5">
                {emotionArc().map((block, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm">
                    <span className="font-mono text-muted-foreground text-xs w-24 shrink-0">
                      {FMT(block.start)}–{FMT(block.end)}
                    </span>
                    <span className="font-serif italic">{block.dominant}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Soul orb */}
            {soulHex && (
              <div className="flex flex-col sm:flex-row items-center gap-6 glass rounded-2xl p-6">
                <div
                  className="w-24 h-24 rounded-full flex-shrink-0"
                  style={{
                    background: `radial-gradient(circle at 35% 35%, ${soulHex}, color-mix(in oklab, ${soulHex} 30%, black))`,
                    boxShadow: `0 0 60px ${soulHex}66`,
                  }}
                />
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-1">The soul of this track</p>
                  <h3 className="font-display text-2xl font-semibold">{nameForColor(soulHex)}</h3>
                  <p className="font-serif text-lg mt-1 text-foreground/80">"{poemForColor(soulHex)}"</p>
                  <p className="font-mono text-xs mt-2 text-muted-foreground">{soulHex.toUpperCase()}</p>
                </div>
              </div>
            )}

            {/* Playback */}
            {audioUrl && (
              <div>
                <h2 className="font-display text-lg mb-2">Playback</h2>
                <audio
                  ref={audioRef}
                  src={audioUrl}
                  controls
                  className="w-full"
                  onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime ?? 0)}
                />
              </div>
            )}

            <button
              onClick={() => { setSegments([]); setAudioUrl(null); setCurrentTime(0); setProgress(0); }}
              className="text-sm text-muted-foreground hover:text-foreground transition"
            >
              ← Try another file
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/routes/music.tsx
git commit -m "feat: add /music route — audio file color journey analysis"
```

---

## Task 8: Remove Android/Capacitor files, run full dev check

**Files:**
- Delete: `android/`, `mobile/`, `capacitor.config.ts`

- [ ] **Step 1: Remove untracked Capacitor files**

```bash
rm -rf android/ mobile/ capacitor.config.ts
```

- [ ] **Step 2: Start dev server and verify no TypeScript/build errors**

```bash
npm run dev
```

Expected: server starts, no red TypeScript errors in terminal, `routeTree.gen.ts` regenerated with new routes `/conversation`, `/visualize`, `/music` and without `/lyrics`.

- [ ] **Step 3: Manual smoke test checklist**

Open `http://localhost:5173` in browser:
- [ ] Record page: start mic → live blob animates → stop → locked color differs from last live frame (identity avg) → subtitle appears → save works
- [ ] Voice Map: existing saved voices appear, no regression
- [ ] SiteHeader desktop: five links visible — Record, Voice Map, Conversation, Visualize, Music
- [ ] SiteHeader mobile (DevTools 390px): five icons in bottom tab bar — all visible, no overflow
- [ ] `/conversation`: four speaker slots, "Pick from map" shows saved voices, active speaker buttons, mic toggle, Add Line appends styled entry with emotion tag
- [ ] `/visualize`: canvas fills screen, Start button triggers mic, blob-trail animation visible, emotion label top-left, hex top-right
- [ ] `/music`: drag-drop upload accepted, progress bar animates, ribbon + energy bars + emotion arc + soul orb displayed, playhead moves during audio playback

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: remove Android/Capacitor files, verify all routes"
```
