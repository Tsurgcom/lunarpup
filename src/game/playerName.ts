import { getPref, PREF_PLAYER_NAME, setPref } from "../platform/store";

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
  const stored = getPref(PREF_PLAYER_NAME);
  if (stored == null) return fallback;
  return sanitizePlayerName(stored, fallback);
}

export function savePlayerName(name: string): void {
  setPref(PREF_PLAYER_NAME, name);
}
