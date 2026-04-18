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

  useEffect(() => { getVoices().then(setSavedVoices).catch(() => {}); }, []);

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
