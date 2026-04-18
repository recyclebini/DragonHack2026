# Chromavoice — Changes Design Spec
**Date:** 2026-04-18  
**Status:** Approved

---

## Overview

Five changes to Chromavoice: a two-layer color system (identity + emotion), removal of the lyrics page, and three new routes (/conversation, /visualize, /music), plus cleanup of leftover Android/Capacitor files.

---

## Change 1 — Two-layer color system

### Layer 1: Identity color (stable, saved)

**In `use-voice-analyzer.ts`:**
- Add internal `samplesRef: string[]` that collects `featuresToColor(currentFeatures)` every 200ms while recording is active.
- Export `samples: string[]` from the hook return value.
- Reset `samplesRef` on each `start()` call.

**In `src/routes/index.tsx`:**
- On stop/lock, compute `identityHex = groupColor(samples)` (not the last live color).
- Save `identityHex` to the voice store.
- Display `identityHex` in the locked blob and on VoiceCard.
- Add subtitle under color name: `"This is your color — stable, personal, yours. However you speak, this is who you are."`

**`featuresToColor()` is unchanged** — still drives real-time blob animation.

### Layer 2: Emotion modifier (live only, never saved)

Add `applyEmotion(identityHex: string, features: VoiceFeatures)` to `voice-color.ts`:

```
Returns: { color: string, fontStyle: string, fontWeight: number, textTransform: string, emotionLabel: string }
```

| Condition | Hue shift | Weight | Style | Transform | Label |
|-----------|-----------|--------|-------|-----------|-------|
| pitch > 250 && energy > 0.5 | +30° yellow | 600 | normal | none | Happy |
| pitch < 150 && energy < 0.3 | −30° blue | 300 | italic | none | Sad |
| energy > 0.7 && pitch < 200 | −60° red | 800 | normal | uppercase | Intense |
| energy < 0.3 && pitch > 250 | +60° green | 400 | italic | none | Nervous |
| energy < 0.4 && 150 < pitch < 250 | +15° peach | 300 | italic | none | Tender |
| else | 0° (identity) | 400 | normal | none | Neutral |

Hue shifts applied via `chroma(identityHex).set('hsl.h', '+30')` (chroma-js already in project).

---

## Change 2 — Remove lyrics page

- Delete `src/routes/lyrics.tsx`
- Remove its route registration from `src/routes/__root.tsx`
- Remove "Lyrics" link from `src/components/SiteHeader.tsx`
- Keep `src/lib/deepgram.ts` and `src/lib/audio-analysis.ts` — reused by /music

---

## Change 3 — /conversation route

**Purpose:** Deaf users understand who is speaking and how they feel in real time.

**Speaker slots (up to 4):**
- Each slot: color swatch + editable name field.
- Slots start blank.
- "Pick from map" button on each slot opens a small popover listing saved voices from the voice store; selecting one fills in the name and identity color.
- If no saved voice is assigned, a distinct auto-assigned hue is used (evenly spaced: 0°, 90°, 180°, 270°).

**Active speaker selection:**
- Row of large colored buttons (one per active slot) — tapping/clicking switches the active speaker.
- Live mic (`useVoiceAnalyzer()`) runs continuously.
- The current color display shows the active speaker's identity color modified by `applyEmotion()`.

**Transcript:**
- Text input field + "Add line" button.
- On submit: appends entry with:
  - Speaker name badge (identity color background)
  - Typed text styled by `applyEmotion()` styles at moment of submission
  - Small emotion tag (e.g. "Tender")
- Transcript area is scrollable, newest entry at bottom.

**Bottom legend:** Each active speaker's name + color swatch.

**Layout:** Mobile-first, full width, large tap targets. Desktop: two-column (speakers left, transcript right).

---

## Change 4 — /visualize route

**Purpose:** Deaf users experience live music/concerts as pure color and movement.

**Structure:**
- Full-screen dark `<canvas>` with `requestAnimationFrame` loop.
- Uses `useVoiceAnalyzer()` for live mic.
- Start/Stop button centered at bottom.

**Canvas drawing (each frame):**
1. **Background fade:** `fillRect` with current `featuresToColor()` color at ~4% alpha — creates a slow color-trail fade.
2. **Melody thread:** Horizontal line at `y = height * (1 − normalizedPitch)`, drawn in current color with 2px stroke. Each frame extends the line rightward; canvas scrolls left when reaching edge (shift pixels).
3. **Pulse rings:** When `|energy − prevEnergy| > 0.25`, emit an expanding ring from center. Ring fades from current color to transparent over 800ms. Multiple rings can coexist.
4. **Beat dots:** On energy spike (same threshold), place a small filled circle (r=4–8) at a random position. Fade over 500ms.

**Overlays (drawn on canvas, not DOM):**
- Top-left: emotion label from `applyEmotion()` in large (~48px) font-serif italic, colored by emotion color.
- Top-right: current hex string in font-mono (~14px).

**State managed in `useRef` arrays:** `rings[]`, `dots[]` — each with `startTime`, `position`, `color`.

---

## Change 5 — /music route

**Purpose:** Process a recorded/downloaded audio file, show its emotional color journey.

**Upload:**
- Drag-drop or file picker, accepts `.mp3 .wav .ogg .flac .aac`.
- Validated by MIME type + extension on the client.

**Processing:**
- `AudioContext.decodeAudioData()` → decoded `AudioBuffer`.
- Process in 200ms chunks using `analyzeSegment()` from `src/lib/audio-analysis.ts` (no new logic needed — already exports pitch/brightness/energy per buffer slice).
- For each chunk: `featuresToColor()` + `applyEmotion()` → build `segments: Array<{ time: number, color: string, emotionLabel: string, features: VoiceFeatures }>`.
- Batched with `setTimeout(..., 0)` every N chunks to keep UI responsive.
- Progress bar shown during processing (segments processed / total).

**Display after processing:**

1. **Color ribbon:** Full-width horizontal bar. Each segment = thin slice. Hover shows timestamp + emotion label tooltip.
2. **Emotion arc:** Text list of dominant emotion per 10s block. Format: `"0:00–0:10 · Tender"`.
3. **Soul orb:** `groupColor()` of all segment colors → large colored circle with `nameForColor()` + `poemForColor()`. Labeled "The soul of this track."
4. **Energy bars:** Row of vertical bars, height = energy, color = emotion color. Full width, compressed to fit.

**Playback:**
- Standard `<audio>` element (native controls or custom play/pause/scrub).
- A playhead marker (vertical line) moves along the ribbon synced to `audio.currentTime`.

---

## Cleanup

Remove untracked Android/Capacitor leftovers:
- `android/` directory
- `mobile/` directory
- `capacitor.config.ts`

---

## Navigation order (SiteHeader)

`Record | Voice Map | Conversation | Visualize | Music`

---

## Design constraints

- Dark background, `.glass` glassmorphism, soft colored glows via `boxShadow`.
- `font-display`, `font-serif`, `font-mono` as in existing components.
- Canvas animations: native canvas API only, no new libraries.
- No new npm packages — only what's in `package.json`.
- Mobile-friendly on all new pages.
- Record and Voice Map functionality must not regress.
- TypeScript: no errors after all changes (`npm run dev` clean).
