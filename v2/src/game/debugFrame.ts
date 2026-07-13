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
  grounded: boolean;
  airTime: number;
  lean: number;
  pitch: number;
  normalForce: number;
  /** Vel along surface normal (m/s). */
  vn: number;
  /** Board clearance vs contact surface (m). + = penetrating. */
  penetration: number;
  /** |body.pos − prev body.pos| this frame (m). */
  bodyDelta: number;
  /** Body Δ along surface normal (m). */
  bodyRadial: number;
  /** Body Δ tangential (m). */
  bodyTangential: number;
  /** |renderPos − prev renderPos| this frame (m). */
  renderDelta: number;
  /** |body.pos − renderPos| (m). */
  bodyRenderGap: number;
  /** (body − render) along normal (m). */
  bodyRenderRadial: number;
  /** Angle between mesh quat and target (rad). */
  quatErr: number;
  /** Radial damp path active this frame. */
  dampActive: boolean;
  /** Peak |body Δ| in the last ~0.5s (m). */
  peakBodyDelta: number;
  /** Peak |body radial Δ| in the last ~0.5s (m). */
  peakBodyRadial: number;
  /** Peak |render Δ| in the last ~0.5s (m). */
  peakRenderDelta: number;
  /** Grounded flips in the last ~0.5s. */
  groundedFlips: number;
};

const EMPTY: DebugFrame = {
  dtMs: 0,
  fps: 0,
  fpsSmooth: 0,
  speed: 0,
  grounded: false,
  airTime: 0,
  lean: 0,
  pitch: 0,
  normalForce: 0,
  vn: 0,
  penetration: 0,
  bodyDelta: 0,
  bodyRadial: 0,
  bodyTangential: 0,
  renderDelta: 0,
  bodyRenderGap: 0,
  bodyRenderRadial: 0,
  quatErr: 0,
  dampActive: false,
  peakBodyDelta: 0,
  peakBodyRadial: 0,
  peakRenderDelta: 0,
  groundedFlips: 0,
};

let frame: DebugFrame = { ...EMPTY };
let fpsEma = 60;

type PeakSample = { t: number; body: number; radial: number; render: number };
const peaks: PeakSample[] = [];
const PEAK_WINDOW = 0.5;

let prevGrounded: boolean | null = null;
let flipCount = 0;
let flipWindowStart = 0;
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
  prevGrounded = null;
  flipCount = 0;
  flipWindowStart = 0;
  clock = 0;
  emit();
}

/**
 * Called once per render frame from Player with already-computed deltas.
 */
export function tickDebugFrame( partial: Omit<
  DebugFrame,
  | "fps"
  | "fpsSmooth"
  | "peakBodyDelta"
  | "peakBodyRadial"
  | "peakRenderDelta"
  | "groundedFlips"
>,
): void {
  clock += partial.dtMs / 1000;
  const fps = partial.dtMs > 1e-4 ? 1000 / partial.dtMs : 0;
  const alpha = 1 - Math.exp(-(partial.dtMs / 1000) * 2.5);
  fpsEma += (fps - fpsEma) * alpha;

  if (prevGrounded !== null && prevGrounded !== partial.grounded) {
    flipCount++;
  }
  prevGrounded = partial.grounded;
  if (clock - flipWindowStart > PEAK_WINDOW) {
    flipCount = 0;
    flipWindowStart = clock;
  }

  peaks.push({
    t: clock,
    body: partial.bodyDelta,
    radial: Math.abs(partial.bodyRadial),
    render: partial.renderDelta,
  });
  while (peaks.length > 0 && clock - peaks[0]!.t > PEAK_WINDOW) {
    peaks.shift();
  }
  let peakBody = 0;
  let peakRadial = 0;
  let peakRender = 0;
  for (const p of peaks) {
    if (p.body > peakBody) peakBody = p.body;
    if (p.radial > peakRadial) peakRadial = p.radial;
    if (p.render > peakRender) peakRender = p.render;
  }

  frame = {
    ...partial,
    fps,
    fpsSmooth: fpsEma,
    peakBodyDelta: peakBody,
    peakBodyRadial: peakRadial,
    peakRenderDelta: peakRender,
    groundedFlips: flipCount,
  };
  emit();
}

/** True when `?debug` is on the URL. */
export function isDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).has("debug");
}
