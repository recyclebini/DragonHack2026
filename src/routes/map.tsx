import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Sparkles, Trash2, Users } from "lucide-react";
import { clearVoices, getVoices, type SavedVoice } from "@/lib/voice-store";
import { harmonyScores, groupColor, nameForColor, poemForColor } from "@/lib/voice-color";
import { VoiceCard } from "@/components/VoiceCard";
import { supabase } from "@/lib/supabase";
import chroma from "chroma-js";

export const Route = createFileRoute("/map")({
  head: () => ({
    meta: [
      { title: "Voice Map — Seenesthesia" },
      { name: "description", content: "A constellation of voices, each one a glowing color." },
    ],
  }),
  component: MapPage,
});

function posFor(voice: SavedVoice, w: number, h: number) {
  const [h_hsl, , l] = chroma(voice.hex).hsl();
  const hue = isNaN(h_hsl) ? 0 : h_hsl;
  const angle = (hue / 360) * Math.PI * 2 - Math.PI / 2;
  const radiusMax = Math.min(w, h) * 0.38;
  const radiusMin = Math.min(w, h) * 0.12;
  const radius = radiusMin + (1 - l) * (radiusMax - radiusMin);
  return {
    x: w / 2 + Math.cos(angle) * radius,
    y: h / 2 + Math.sin(angle) * radius,
  };
}

const HUE_FAMILIES = [
  { label: "Red",    color: "#e74c3c", test: (h: number) => h >= 340 || h < 20 },
  { label: "Orange", color: "#e67e22", test: (h: number) => h >= 20 && h < 50 },
  { label: "Yellow", color: "#f1c40f", test: (h: number) => h >= 50 && h < 70 },
  { label: "Green",  color: "#27ae60", test: (h: number) => h >= 70 && h < 160 },
  { label: "Teal",   color: "#1abc9c", test: (h: number) => h >= 160 && h < 200 },
  { label: "Blue",   color: "#3498db", test: (h: number) => h >= 200 && h < 260 },
  { label: "Purple", color: "#9b59b6", test: (h: number) => h >= 260 && h < 320 },
  { label: "Pink",   color: "#e91e63", test: (h: number) => h >= 320 && h < 340 },
] as const;

function MapPage({ hideSiteHeader }: { hideSiteHeader?: boolean } = {}) {
  const [voices, setVoices] = useState<SavedVoice[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showHarmony, setShowHarmony] = useState(false);
  const [showGroup, setShowGroup] = useState(false);
  const [size, setSize] = useState({ w: 800, h: 520 });
  const [activeFilter, setActiveFilter] = useState<string | null>(null);

  // Pan & zoom state
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const groupPanelRef = useRef<HTMLDivElement>(null);
  const selectionPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getVoices().then(setVoices);

    const channel = supabase
      .channel("voices-live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "voices" }, (payload) => {
        const r = payload.new as Record<string, unknown>;
        const v: SavedVoice = {
          id: r.id as string,
          name: r.name as string,
          hex: r.hex as string,
          colorName: r.color_name as string,
          poem: r.poem as string,
          createdAt: new Date(r.created_at as string).getTime(),
        };
        setVoices((prev) => prev.some((x) => x.id === v.id) ? prev : [...prev, v]);
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "voices" }, (payload) => {
        setVoices((prev) => prev.filter((v) => v.id !== (payload.old as { id: string }).id));
      })
      .subscribe();

    const onResize = () => {
      const w = Math.min(1100, window.innerWidth - 60);
      setSize({ w, h: Math.max(420, Math.min(640, w * 0.6)) });
    };
    onResize();
    window.addEventListener("resize", onResize);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  // Only one selected voice for harmony
  const selectedVoice = selectedIds.length === 1 ? voices.find((v) => v.id === selectedIds[0]) ?? null : null;

  const scores = useMemo(() => {
    if (!selectedVoice) return new Map<string, number>();
    const others = voices.filter((v) => v.id !== selectedVoice.id);
    const s = harmonyScores(selectedVoice.hex, others.map((v) => v.hex));
    return new Map(others.map((v, i) => [v.id, s[i]]));
  }, [selectedVoice, voices]);

  const groupHex = useMemo(() => groupColor(voices.map((v) => v.hex)), [voices]);
  const groupName = useMemo(() => nameForColor(groupHex), [groupHex]);
  const groupPoem = useMemo(() => poemForColor(groupHex), [groupHex]);

  // Multi-select group voice
  const selectionVoices = useMemo(() => voices.filter((v) => selectedIds.includes(v.id)), [voices, selectedIds]);
  const selectionGroupHex = useMemo(
    () => selectionVoices.length >= 2 ? groupColor(selectionVoices.map((v) => v.hex)) : null,
    [selectionVoices],
  );

  // Color family filter
  const displayVoices = useMemo(() => {
    if (!activeFilter) return voices;
    const family = HUE_FAMILIES.find((f) => f.label === activeFilter);
    if (!family) return voices;
    return voices.filter((v) => {
      const [h] = chroma(v.hex).hsl();
      return family.test(isNaN(h) ? 0 : h);
    });
  }, [voices, activeFilter]);

  const handleClear = async () => {
    if (confirm("Clear all saved voices?")) {
      await clearVoices();
      setVoices([]);
      setSelectedIds([]);
    }
  };

  // Pan handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    dragStartRef.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragStartRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      setIsDragging(true);
      setOffset({ x: dragStartRef.current.ox + dx, y: dragStartRef.current.oy + dy });
    }
  };

  const handleMouseUp = () => {
    dragStartRef.current = null;
    setIsDragging(false);
  };

  // In the direct-position model, offset scales with zoom so the "anchor" stays fixed
  const applyZoom = (factor: number, anchorX = 0, anchorY = 0) => {
    const z = zoomRef.current;
    const newZoom = Math.max(0.25, Math.min(4, z * factor));
    const scale = newZoom / z;
    zoomRef.current = newZoom;
    setZoom(newZoom);
    // offset encodes pan; when spreading dots we keep the anchor point fixed:
    // new_offset = anchor * (1 - scale) + old_offset * scale
    setOffset((o) => ({
      x: anchorX * (1 - scale) + o.x * scale,
      y: anchorY * (1 - scale) + o.y * scale,
    }));
  };

  const zoomToCenter = (factor: number) => applyZoom(factor, 0, 0);

  // Native non-passive wheel listener — zooms toward mouse cursor
  useEffect(() => {
    const el = mapContainerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left - el.clientWidth / 2;
      const my = e.clientY - rect.top - el.clientHeight / 2;
      const factor = e.deltaY < 0 ? 1.12 : 0.9;
      const z = zoomRef.current;
      const newZoom = Math.max(0.25, Math.min(4, z * factor));
      const scale = newZoom / z;
      zoomRef.current = newZoom;
      setZoom(newZoom);
      setOffset((o) => ({
        x: mx * (1 - scale) + o.x * scale,
        y: my * (1 - scale) + o.y * scale,
      }));
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);


  return (
    <div className="min-h-screen">
      {!hideSiteHeader && <SiteHeader />}
      <main className="mx-auto max-w-6xl px-5 pt-6 pb-36 md:pb-24">
        {/* Toolbar */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
          <div>
            <h1 className="font-display text-4xl font-semibold">My People</h1>
            <p className="text-muted-foreground mt-1">
              {voices.length} {voices.length === 1 ? "voice" : "voices"} saved · tap a color to learn more
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {selectedIds.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="rounded-full"
                onClick={() => { setSelectedIds([]); setShowHarmony(false); }}
              >
                ✕ {selectedIds.length} selected
              </Button>
            )}
            {voices.length >= 2 && (
              <Button
                variant="secondary"
                className="rounded-full glass"
                onClick={() => {
                  const next = !showGroup;
                  setShowGroup(next);
                  setShowHarmony(false);
                  if (next) setTimeout(() => groupPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
                }}
              >
                <Users className="size-4" />
                {showGroup ? "Hide group voice" : "Our group voice"}
              </Button>
            )}
            <Button
              variant="secondary"
              className="rounded-full glass"
              disabled={selectedVoice === null}
              onClick={() => { setShowHarmony((h) => !h); setShowGroup(false); }}
            >
              <Sparkles className="size-4" />
              {showHarmony ? "Hide harmony" : "Find my harmony"}
            </Button>
            {voices.length > 0 && (
              <Button variant="ghost" className="rounded-full" onClick={handleClear}>
                <Trash2 className="size-4" />
                Clear
              </Button>
            )}
          </div>
        </div>

        {/* Color family filter chips */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {HUE_FAMILIES.map((f) => (
            <button
              key={f.label}
              onClick={() => setActiveFilter(activeFilter === f.label ? null : f.label)}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all"
              style={{
                background: activeFilter === f.label ? f.color + "33" : "transparent",
                border: `1.5px solid ${activeFilter === f.label ? f.color : f.color + "55"}`,
                color: activeFilter === f.label ? f.color : f.color + "aa",
              }}
            >
              <span className="w-2 h-2 rounded-full" style={{ background: f.color }} />
              {f.label}
            </button>
          ))}
        </div>

        {/* Canvas */}
        <div
          ref={mapContainerRef}
          className="relative glass rounded-3xl overflow-hidden"
          style={{
            height: size.h,
            background: "radial-gradient(circle at 50% 30%, oklch(0.2 0.05 280) 0%, oklch(0.1 0.02 270) 80%)",
            cursor: isDragging ? "grabbing" : "grab",
          }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {/* Zoom controls */}
          <div className="absolute top-3 right-3 z-10 flex flex-col gap-1">
            <button
              className="glass w-11 h-11 rounded-xl text-sm font-bold hover:bg-white/20 active:bg-white/20 transition"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => zoomToCenter(1.3)}
            >+</button>
            <button
              className="glass w-11 h-11 rounded-xl text-sm font-bold hover:bg-white/20 active:bg-white/20 transition"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => zoomToCenter(1 / 1.3)}
            >−</button>
            <button
              className="glass w-11 h-11 rounded-xl text-xs hover:bg-white/20 active:bg-white/20 transition"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => { zoomRef.current = 1; setZoom(1); setOffset({ x: 0, y: 0 }); }}
            >⌂</button>
          </div>

          {voices.length === 0 ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
              <p className="font-serif text-2xl text-muted-foreground">No voices yet.</p>
              <p className="text-sm text-muted-foreground mt-2">Scan someone's voice to add them to your world.</p>
            </div>
          ) : (
            <div style={{ position: "absolute", inset: 0 }}>
              {displayVoices.map((v) => {
                const { x: wx, y: wy } = posFor(v, size.w, size.h);
                const cx = size.w / 2;
                const cy = size.h / 2;
                const x = cx + (wx - cx) * zoom + offset.x;
                const y = cy + (wy - cy) * zoom + offset.y;
                const isSelected = selectedIds.includes(v.id);
                const score = scores.get(v.id) ?? 0;
                const dim = showHarmony && selectedVoice && !isSelected && score < 0.4;
                const highlighted = showHarmony && score > 0.4 && !isSelected;
                const r = 18 + (highlighted ? 10 : 0) + (isSelected ? 14 : 0);
                return (
                  <button
                    key={v.id}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={() => {
                      setSelectedIds((prev) =>
                        prev.includes(v.id) ? prev.filter((id) => id !== v.id) : [...prev, v.id],
                      );
                      setShowHarmony(false);
                      setShowGroup(false);
                    }}
                    className="absolute group transition-all"
                    style={{ left: x - r, top: y - r, width: r * 2, height: r * 2, opacity: dim ? 0.2 : 1 }}
                    aria-label={v.name}
                  >
                    <span
                      className="absolute inset-0 rounded-full animate-float"
                      style={{
                        background: `radial-gradient(circle, ${v.hex} 0%, ${v.hex}99 40%, transparent 75%)`,
                        boxShadow: `0 0 30px ${v.hex}, 0 0 80px ${v.hex}66`,
                        animationDelay: `${(v.id.charCodeAt(0) % 6) * -1}s`,
                      }}
                    />
                    {isSelected && (
                      <span
                        className="absolute -inset-2 rounded-full border animate-ring-pulse"
                        style={{ borderColor: v.hex }}
                      />
                    )}
                    <span className="absolute left-1/2 top-full mt-2 -translate-x-1/2 whitespace-nowrap text-xs glass px-2 py-1 rounded-md opacity-0 group-hover:opacity-100 transition pointer-events-none">
                      {v.name} · <span className="text-muted-foreground">{v.colorName}</span>
                    </span>
                  </button>
                );
              })}

            </div>
          )}
        </div>

        {/* Selection group voice panel */}
        {selectionVoices.length >= 2 && !showGroup && !showHarmony && selectionGroupHex && (
          <div ref={selectionPanelRef} className="mt-6 glass rounded-2xl p-6 max-w-xl animate-fade-up">
            <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground mb-3">
              Group voice · {selectionVoices.length} selected
            </p>
            <div className="flex items-center gap-4">
              <div
                className="w-16 h-16 rounded-full flex-shrink-0"
                style={{ background: selectionGroupHex, boxShadow: `0 0 30px ${selectionGroupHex}88` }}
              />
              <div>
                <p className="font-display text-2xl font-semibold" style={{ color: selectionGroupHex }}>
                  {nameForColor(selectionGroupHex)}
                </p>
                <p className="font-mono text-xs text-muted-foreground">{selectionGroupHex.toUpperCase()}</p>
                <p className="font-serif mt-1 text-foreground/80">"{poemForColor(selectionGroupHex)}"</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              {selectionVoices.map((v) => v.name).join(", ")}
            </p>
          </div>
        )}

        {/* Full group voice panel */}
        {showGroup && voices.length >= 2 && (
          <div ref={groupPanelRef} className="mt-10 glass rounded-2xl p-6 max-w-xl animate-fade-up">
            <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground mb-3">Your group voice</p>
            <div className="flex items-center gap-4">
              <div
                className="w-16 h-16 rounded-full flex-shrink-0"
                style={{ background: groupHex, boxShadow: `0 0 30px ${groupHex}88` }}
              />
              <div>
                <p className="font-display text-2xl font-semibold" style={{ color: groupHex }}>{groupName}</p>
                <p className="font-mono text-xs text-muted-foreground">{groupHex.toUpperCase()}</p>
                <p className="font-serif mt-1 text-foreground/80">"{groupPoem}"</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-4">
              The color of everyone in your world together — what all the people you love sound like as one.
            </p>
          </div>
        )}

        {/* Single selected voice panel */}
        {selectedIds.length === 1 && selectedVoice && !showGroup && (
          <div className="mt-10 grid md:grid-cols-2 gap-10 items-start animate-fade-up">
            <VoiceCard voice={selectedVoice} />
            <div className="space-y-3">
              <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Selected voice</p>
              <h2 className="font-display text-3xl font-semibold">{selectedVoice.name}</h2>
              <p className="text-muted-foreground">
                {showHarmony
                  ? "Brighter dots are voices that naturally resonate with this one — emotionally close or beautifully contrasting."
                  : 'Tap "Find my harmony" to discover which voices in your life resonate with this person.'}
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
