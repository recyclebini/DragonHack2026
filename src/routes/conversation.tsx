import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Square, Trash2 } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { VoiceBlob } from "@/components/VoiceBlob";
import { useVoiceAnalyzer } from "@/hooks/use-voice-analyzer";
import { applyEmotion } from "@/lib/voice-color";
import type { VoiceFeatures } from "@/lib/voice-color";

export const Route = createFileRoute("/conversation")({
  component: ConversationPage,
});

type TranscriptWord = {
  word: string;
  color: string;
  fontStyle: "normal" | "italic";
  fontWeight: number;
  textTransform: "none" | "uppercase";
};

const DG_RATE = 16000;

function downsample(buffer: Float32Array, fromRate: number, toRate: number): Int16Array {
  if (fromRate === toRate) {
    const out = new Int16Array(buffer.length);
    for (let i = 0; i < buffer.length; i++) {
      out[i] = Math.max(-32768, Math.min(32767, Math.round(buffer[i] * 32767)));
    }
    return out;
  }
  const ratio = fromRate / toRate;
  const outLen = Math.round(buffer.length / ratio);
  const out = new Int16Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const srcIdx = Math.min(Math.round(i * ratio), buffer.length - 1);
    out[i] = Math.max(-32768, Math.min(32767, Math.round(buffer[srcIdx] * 32767)));
  }
  return out;
}

function ConversationPage() {
  const [transcript, setTranscript] = useState<TranscriptWord[]>([]);
  const [recording, setRecording] = useState(false);
  const [dgError, setDgError] = useState<string | null>(null);

  const transcriptRef = useRef<HTMLDivElement>(null);
  const { state, start: startAnalyzer, stop: stopAnalyzer, color, features } = useVoiceAnalyzer();

  const wsRef = useRef<WebSocket | null>(null);
  const dgStreamRef = useRef<MediaStream | null>(null);
  const dgCtxRef = useRef<AudioContext | null>(null);
  const dgProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const colorRef = useRef<string>(color);
  const featuresRef = useRef<VoiceFeatures>(features);

  useEffect(() => { colorRef.current = color; }, [color]);
  useEffect(() => { featuresRef.current = features; }, [features]);

  useEffect(() => {
    if (transcriptRef.current)
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
  }, [transcript]);

  const emotion = applyEmotion(color, features);

  const stopRecording = useCallback(() => {
    setRecording(false);
    stopAnalyzer();

    if (dgProcessorRef.current) {
      dgProcessorRef.current.onaudioprocess = null;
      dgProcessorRef.current.disconnect();
      dgProcessorRef.current = null;
    }

    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      try { ws.send(JSON.stringify({ type: "CloseStream" })); } catch {}
      setTimeout(() => { ws.close(); }, 500);
    }
    wsRef.current = null;

    dgCtxRef.current?.close().catch(() => {});
    dgCtxRef.current = null;
    dgStreamRef.current?.getTracks().forEach((t) => t.stop());
    dgStreamRef.current = null;
  }, [stopAnalyzer]);

  useEffect(() => () => { stopRecording(); }, [stopRecording]);

  const startRecording = async () => {
    const key = import.meta.env.VITE_DEEPGRAM_API_KEY as string | undefined;
    setDgError(key ? null : "no-key");
    setRecording(true);
    startAnalyzer();

    if (!key) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      dgStreamRef.current = stream;

      const ctx = new AudioContext();
      dgCtxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);

      // eslint-disable-next-line @typescript-eslint/no-deprecated
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      dgProcessorRef.current = processor;
      src.connect(processor);
      processor.connect(ctx.destination);

      const ws = new WebSocket(
        "wss://api.deepgram.com/v1/listen?model=nova-2&language=en&encoding=linear16&sample_rate=16000&channels=1&punctuate=true&words=true",
        ["token", key]
      );
      wsRef.current = ws;

      ws.onopen = () => {
        processor.onaudioprocess = (e: AudioProcessingEvent) => {
          if (ws.readyState !== WebSocket.OPEN) return;
          const pcm = downsample(e.inputBuffer.getChannelData(0), ctx.sampleRate, DG_RATE);
          ws.send(pcm.buffer);
        };
      };

      ws.onmessage = (evt) => {
        try {
          const data = JSON.parse(evt.data as string) as {
            is_final?: boolean;
            channel?: { alternatives?: Array<{ words?: Array<{ word: string }> }> };
          };
          if (!data.is_final) return;
          const words = data.channel?.alternatives?.[0]?.words ?? [];
          if (!words.length) return;
          const emo = applyEmotion(colorRef.current, featuresRef.current);
          setTranscript((prev) => [
            ...prev,
            ...words.map((w) => ({
              word: w.word,
              color: emo.color,
              fontStyle: emo.fontStyle,
              fontWeight: emo.fontWeight,
              textTransform: emo.textTransform,
            })),
          ]);
        } catch {}
      };

      ws.onerror = () => setDgError("error");
    } catch {
      setDgError("error");
    }
  };

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-5 pt-6 pb-32 md:pb-8">
        <h1 className="font-display text-4xl font-semibold">Conversation</h1>
        <p className="text-muted-foreground mt-1 mb-8">
          Ask someone to speak to you. Their words appear in the color of their emotion — so you feel not just what they say, but how they mean it.
        </p>

        {/* Record button + live blob */}
        <div className="flex items-center gap-4 mb-4 flex-wrap">
          <button
            onClick={recording ? stopRecording : startRecording}
            className="flex items-center gap-3 px-6 py-4 rounded-2xl text-base font-medium transition-all"
            style={{
              background: recording ? "transparent" : emotion.color,
              color: recording ? emotion.color : "#0d0d0d",
              border: `2px solid ${emotion.color}`,
              boxShadow: recording ? `0 0 30px ${emotion.color}44` : "none",
            }}
          >
            {recording ? <Square className="size-5 fill-current" /> : <Mic className="size-5" />}
            {recording ? "Stop" : "Start listening"}
          </button>

          {(recording || state === "listening") && (
            <VoiceBlob color={emotion.color} energy={features.energy} size={56} />
          )}

          {transcript.length > 0 && (
            <button
              onClick={() => setTranscript([])}
              className="ml-auto flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition"
            >
              <Trash2 className="size-4" />
              Clear
            </button>
          )}
        </div>

        {state === "denied" && (
          <p className="text-sm text-destructive mb-3">Microphone access was denied.</p>
        )}

        {dgError === "no-key" && (
          <div className="mb-4 px-4 py-3 glass rounded-xl text-sm text-muted-foreground">
            Add a <code className="font-mono text-xs">VITE_DEEPGRAM_API_KEY</code> to enable word-level transcript coloring.
          </div>
        )}
        {dgError === "error" && (
          <div className="mb-4 px-4 py-3 glass rounded-xl text-sm text-destructive">
            Could not connect to Deepgram. Check your API key and network connection.
          </div>
        )}

        {/* Transcript */}
        <div
          ref={transcriptRef}
          className="glass rounded-2xl p-6 min-h-[240px] max-h-[60vh] overflow-y-auto"
        >
          {transcript.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center mt-10">
              {recording ? "Listening… ask them to speak." : "Tap Start to begin listening."}
            </p>
          ) : (
            <p className="leading-relaxed text-lg">
              {transcript.map((w, i) => (
                <span
                  key={i}
                  style={{
                    color: w.color,
                    fontStyle: w.fontStyle,
                    fontWeight: w.fontWeight,
                    textTransform: w.textTransform,
                  }}
                >
                  {w.word}{" "}
                </span>
              ))}
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
