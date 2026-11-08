import { isTauri as tauriIsTauri } from "@tauri-apps/api/core";

/** True when running inside a Tauri WebView. */
export function isTauri(): boolean {
  try {
    return tauriIsTauri();
  } catch {
    return false;
  }
}
