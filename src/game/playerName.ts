const STORAGE_KEY = "lunarpup:playerName:v1";
const MAX_LEN = 16;

/** Default when the player leaves the name blank. */
export function fallbackPlayerName(selfId: string): string {
  const tail = selfId.slice(-4) || "pup";
  return `Pup${tail}`;
}

/**
 * Trim, collapse spaces, strip illegal chars, clamp length.
 * Empty / fully stripped → `fallback`.
 */
export function sanitizePlayerName(raw: string, fallback: string): string {
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (!trimmed) return fallback;
  const cleaned = trimmed
    .replace(/[^a-zA-Z0-9 _-]/g, "")
    .slice(0, MAX_LEN)
    .trim();
  return cleaned || fallback;
}

export function loadPlayerName(fallback: string): string {
  try {
    if (typeof localStorage === "undefined") return fallback;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored == null) return fallback;
    return sanitizePlayerName(stored, fallback);
  } catch {
    return fallback;
  }
}

export function savePlayerName(name: string): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(STORAGE_KEY, name);
  } catch {
    /* quota / private mode */
  }
}
