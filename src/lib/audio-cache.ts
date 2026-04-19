const MAX_ENTRIES = 10;

type CacheEntry<T> = { key: string; data: T; cachedAt: number };

function read<T>(storageKey: string): CacheEntry<T>[] {
  try { return JSON.parse(localStorage.getItem(storageKey) || "[]"); }
  catch { return []; }
}

function write<T>(storageKey: string, entries: CacheEntry<T>[]) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(entries));
  } catch {
    // Storage quota hit — drop oldest half and retry
    try { localStorage.setItem(storageKey, JSON.stringify(entries.slice(-Math.floor(MAX_ENTRIES / 2)))); }
    catch {}
  }
}

export function fileKey(file: File): string {
  return `${file.name}_${file.size}_${file.lastModified}`;
}

export function getCached<T>(storageKey: string, key: string): T | null {
  return read<T>(storageKey).find((e) => e.key === key)?.data ?? null;
}

export function setCached<T>(storageKey: string, key: string, data: T): void {
  const entries = read<T>(storageKey).filter((e) => e.key !== key);
  entries.push({ key, data, cachedAt: Date.now() });
  write(storageKey, entries.slice(-MAX_ENTRIES));
}
