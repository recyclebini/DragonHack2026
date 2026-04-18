export type SavedVoice = {
  id: string;
  name: string;
  hex: string;
  colorName: string;
  poem: string;
  createdAt: number;
};

const KEY = "chromavoice.voices.v1";

export function getVoices(): SavedVoice[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

export function saveVoice(v: Omit<SavedVoice, "id" | "createdAt">): SavedVoice {
  const all = getVoices();
  const entry: SavedVoice = { ...v, id: crypto.randomUUID(), createdAt: Date.now() };
  all.push(entry);
  localStorage.setItem(KEY, JSON.stringify(all));
  return entry;
}

export function clearVoices() {
  localStorage.removeItem(KEY);
}
