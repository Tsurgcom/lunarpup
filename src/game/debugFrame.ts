/**
 * Per-frame pup diagnostics for jitter hunting.
 * Enable the HUD with `?debug` on the URL.
 */

export type DebugFrame = {
  /** Raw frame dt after clamp (ms). */
  dtMs: number;
  /** Instantaneous fps from dt. */
  fps: number;
  /** Smoothed fps (~0.5s EMA). */
  fpsSmooth: number;
  speed: number;
  lean: number;
  pitch: number;
  /** |pos − prev pos| this frame (m). */
  bodyDelta: number;
  /** Angle between mesh quat and target (rad). */
  quatErr: number;
  /** Peak |body Δ| in the last ~0.5s (m). */
  peakBodyDelta: number;
  /** Peak dtMs in the last ~0.5s. */
  peakDtMs: number;
};

const EMPTY: DebugFrame = {
  dtMs: 0,
  fps: 0,
  fpsSmooth: 0,
  speed: 0,
  lean: 0,
  pitch: 0,
  bodyDelta: 0,
  quatErr: 0,
  peakBodyDelta: 0,
  peakDtMs: 0,
};

let frame: DebugFrame = { ...EMPTY };
let fpsEma = 60;

type PeakSample = {
  t: number;
  body: number;
  dt: number;
};
const peaks: PeakSample[] = [];
const PEAK_WINDOW = 0.5;

let clock = 0;

const listeners = new Set<() => void>();

export function getDebugFrame(): DebugFrame {
  return frame;
}

export function subscribeDebugFrame(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emit(): void {
  for (const l of listeners) l();
}

export function resetDebugFrame(): void {
  frame = { ...EMPTY };
  fpsEma = 60;
  peaks.length = 0;
  clock = 0;
  emit();
}

/**
 * Called once per render frame from Player with already-computed deltas.
 */
export function tickDebugFrame(
  partial: Omit<DebugFrame, "fps" | "fpsSmooth" | "peakBodyDelta" | "peakDtMs">,
): void {
  clock += partial.dtMs / 1000;
  const fps = partial.dtMs > 1e-4 ? 1000 / partial.dtMs : 0;
  const alpha = 1 - Math.exp(-(partial.dtMs / 1000) * 2.5);
  fpsEma += (fps - fpsEma) * alpha;

  peaks.push({
    t: clock,
    body: partial.bodyDelta,
    dt: partial.dtMs,
  });
  while (peaks.length > 0 && clock - peaks[0]!.t > PEAK_WINDOW) {
    peaks.shift();
  }
  let peakBody = 0;
  let peakDt = 0;
  for (const p of peaks) {
    if (p.body > peakBody) peakBody = p.body;
    if (p.dt > peakDt) peakDt = p.dt;
  }

  frame = {
    ...partial,
    fps,
    fpsSmooth: fpsEma,
    peakBodyDelta: peakBody,
    peakDtMs: peakDt,
  };
  emit();
}

/** True when `?debug` is on the URL. */
export function isDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).has("debug");
}
