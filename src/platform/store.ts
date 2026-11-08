import { isTauri } from "./detect";

export const PREF_PLAYER_NAME = "playerName";
export const PREF_PERF_OVERRIDE = "perfOverride";

const STORE_PATH = "lunarpup-prefs.json";

type StoreApi = {
  get: <T>(key: string) => Promise<T | undefined>;
  set: (key: string, value: unknown) => Promise<void>;
};

let storePromise: Promise<StoreApi | null> | null = null;

async function getStore(): Promise<StoreApi | null> {
  if (!isTauri()) return null;
  if (!storePromise) {
    storePromise = (async () => {
      try {
        const { load } = await import("@tauri-apps/plugin-store");
        return await load(STORE_PATH, {
          defaults: {},
          autoSave: true,
        });
      } catch {
        return null;
      }
    })();
  }
  return storePromise;
}

function readLocal(key: string): string | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage.getItem(`lunarpup:${key}:v1`);
  } catch {
    return null;
  }
}

function writeLocal(key: string, value: string): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(`lunarpup:${key}:v1`, value);
  } catch {
    /* quota / private mode */
  }
}

/** Sync read — localStorage first (fast boot). */
export function getPref(key: string): string | null {
  return readLocal(key);
}

/** Write to localStorage immediately; mirror to Tauri store when available. */
export function setPref(key: string, value: string): void {
  writeLocal(key, value);
  void (async () => {
    const store = await getStore();
    if (!store) return;
    try {
      await store.set(key, value);
    } catch {
      /* store may be unavailable */
    }
  })();
}

/**
 * Load prefs from Tauri store (if any) and merge into localStorage.
 * Returns keys that changed so callers can re-apply state.
 */
export async function hydratePrefs(): Promise<Record<string, string>> {
  const store = await getStore();
  if (!store) return {};

  const changed: Record<string, string> = {};
  for (const key of [PREF_PLAYER_NAME, PREF_PERF_OVERRIDE]) {
    try {
      const value = await store.get<string>(key);
      if (typeof value !== "string" || !value) continue;
      const current = readLocal(key);
      if (current !== value) {
        writeLocal(key, value);
        changed[key] = value;
      }
    } catch {
      /* skip key */
    }
  }
  return changed;
}
