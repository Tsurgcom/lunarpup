type WakeLockSentinelLike = {
  released: boolean;
  release: () => Promise<void>;
};

let sentinel: WakeLockSentinelLike | null = null;

/** Keep the screen awake during play (Web Wake Lock API). */
export async function requestWakeLock(): Promise<void> {
  if (typeof navigator === "undefined") return;
  const nav = navigator as Navigator & {
    wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinelLike> };
  };
  if (!nav.wakeLock) return;
  try {
    if (sentinel && !sentinel.released) return;
    sentinel = await nav.wakeLock.request("screen");
  } catch {
    sentinel = null;
  }
}

export async function releaseWakeLock(): Promise<void> {
  if (!sentinel || sentinel.released) {
    sentinel = null;
    return;
  }
  try {
    await sentinel.release();
  } catch {
    /* already released */
  }
  sentinel = null;
}
