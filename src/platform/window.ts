import { isTauri } from "./detect";

/** Toggle native window fullscreen. No-op outside Tauri. */
export async function setFullscreen(fullscreen: boolean): Promise<void> {
  if (!isTauri()) return;
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().setFullscreen(fullscreen);
  } catch {
    /* window API unavailable */
  }
}
