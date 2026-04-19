import { supabase } from "./supabase";

export type SavedVoice = {
  id: string;
  name: string;
  hex: string;
  colorName: string;
  poem: string;
  createdAt: number;
};

const isConfigured = () =>
  !!import.meta.env.VITE_SUPABASE_URL &&
  import.meta.env.VITE_SUPABASE_URL !== "https://your-project.supabase.co";

// ── localStorage fallback ─────────────────────────────────────────────────────
const LS_KEY = "seenesthesia.voices.v1";

function lsGet(): SavedVoice[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]"); } catch { return []; }
}
function lsSave(v: Omit<SavedVoice, "id" | "createdAt">): SavedVoice {
  const all = lsGet();
  const entry: SavedVoice = { ...v, id: crypto.randomUUID(), createdAt: Date.now() };
  all.push(entry);
  localStorage.setItem(LS_KEY, JSON.stringify(all));
  return entry;
}
function lsClear() { localStorage.removeItem(LS_KEY); }

function rowToVoice(r: Record<string, unknown>): SavedVoice {
  return {
    id: r.id as string,
    name: r.name as string,
    hex: r.hex as string,
    colorName: r.color_name as string,
    poem: r.poem as string,
    createdAt: new Date(r.created_at as string).getTime(),
  };
}

// ── public API ────────────────────────────────────────────────────────────────
export async function getVoices(): Promise<SavedVoice[]> {
  if (!isConfigured()) return lsGet();
  const { data } = await supabase
    .from("voices")
    .select("*")
    .order("created_at", { ascending: true });
  return (data ?? []).map(rowToVoice);
}

export async function saveVoice(
  v: Omit<SavedVoice, "id" | "createdAt">
): Promise<SavedVoice> {
  if (!isConfigured()) return lsSave(v);
  const userId = (await supabase.auth.getUser()).data.user?.id ?? null;
  const { data, error } = await supabase
    .from("voices")
    .insert({ name: v.name, hex: v.hex, color_name: v.colorName, poem: v.poem, user_id: userId })
    .select()
    .single();
  if (error || !data) throw error ?? new Error("Insert failed");
  return rowToVoice(data);
}

export async function clearVoices(): Promise<void> {
  if (!isConfigured()) { lsClear(); return; }
  const userId = (await supabase.auth.getUser()).data.user?.id ?? null;
  if (userId) {
    await supabase.from("voices").delete().eq("user_id", userId);
  }
}
