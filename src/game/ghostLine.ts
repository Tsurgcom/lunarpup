/**
 * Local bowl-line recording + personal-best ghost replay.
 * Module-level store (like peerStore) — poses mutate at frame rate;
 * React only listens for HUD changes. Ghost replay is shown while paused.
 */

export type LineSample = {
  /** Seconds from line start. */
  t: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  roll: number;
};

export type GhostLine = {
  samples: LineSample[];
  duration: number;
  distance: number;
  airtime: number;
  maxAir: number;
  maxSpeed: number;
};

export type LineHud = {
  /** Current airborne streak (s). */
  air: number;
  /** Session best single air (s). */
  bestAir: number;
  /** Distance of the line currently being recorded (m). */
  lineDist: number;
  /** Whether a sample buffer is open. */
  recording: boolean;
  /** Saved PB line available to race. */
  hasGhost: boolean;
  /** PB line distance (m), 0 if none. */
  bestDist: number;
};

const SAMPLE_DT = 1 / 20;
const MIN_SPEED_START = 1.4;
const MIN_SPEED_END = 0.55;
const IDLE_END_S = 1.15;
const MIN_LINE_DIST = 6;
const MIN_LINE_SAMPLES = 12;
const MAX_SAMPLES = 3600;

type Listener = () => void;

const listeners = new Set<Listener>();

let recording = false;
let lineT = 0;
let sampleAcc = 0;
let idleAcc = 0;
let lineDist = 0;
let lineAir = 0;
let lineMaxAir = 0;
let lineMaxSpeed = 0;
let sessionBestAir = 0;
let samples: LineSample[] = [];
let lastX = 0;
let lastY = 0;
let lastZ = 0;
let hasLastPos = false;

let bestLine: GhostLine | null = null;

let cachedHud: LineHud = {
  air: 0,
  bestAir: 0,
  lineDist: 0,
  recording: false,
  hasGhost: false,
  bestDist: 0,
};

function emit(air: number): void {
  cachedHud = {
    air,
    bestAir: sessionBestAir,
    lineDist,
    recording,
    hasGhost: bestLine !== null,
    bestDist: bestLine?.distance ?? 0,
  };
  if (listeners.size === 0) return;
  for (const l of listeners) l();
}

function lineScore(line: GhostLine): number {
  return line.distance + line.maxAir * 18 + line.airtime * 4;
}

function clearLineBuffers(): void {
  recording = false;
  samples = [];
  lineT = 0;
  sampleAcc = 0;
  idleAcc = 0;
  lineDist = 0;
  lineAir = 0;
  lineMaxAir = 0;
  lineMaxSpeed = 0;
  hasLastPos = false;
}

function pushSample(
  t: number,
  x: number,
  y: number,
  z: number,
  yaw: number,
  pitch: number,
  roll: number,
): void {
  samples.push({ t, x, y, z, yaw, pitch, roll });
}

function commitLine(air: number): void {
  if (!recording) return;

  const ok = samples.length >= MIN_LINE_SAMPLES && lineDist >= MIN_LINE_DIST;
  if (ok) {
    const line: GhostLine = {
      samples,
      duration: samples[samples.length - 1]!.t,
      distance: lineDist,
      airtime: lineAir,
      maxAir: lineMaxAir,
      maxSpeed: lineMaxSpeed,
    };
    if (!bestLine || lineScore(line) > lineScore(bestLine)) {
      bestLine = line;
    }
  }

  clearLineBuffers();
  emit(air);
}

function startLine(x: number, y: number, z: number): void {
  recording = true;
  lineT = 0;
  sampleAcc = 0;
  idleAcc = 0;
  lineDist = 0;
  lineAir = 0;
  lineMaxAir = 0;
  lineMaxSpeed = 0;
  samples = [];
  lastX = x;
  lastY = y;
  lastZ = z;
  hasLastPos = true;
}

/**
 * Feed one render-frame sample while the local pup is skating.
 * Ends the line on prolonged near-standstill; starts when speed rises.
 * `airTime` is continuous airborne time (s).
 */
export function tickGhostLine(
  x: number,
  y: number,
  z: number,
  yaw: number,
  pitch: number,
  roll: number,
  airTime: number,
  speed: number,
  dt: number,
): void {
  const step = Math.min(dt, 0.05);
  if (airTime > sessionBestAir) sessionBestAir = airTime;

  if (!recording) {
    if (speed >= MIN_SPEED_START) {
      startLine(x, y, z);
      pushSample(0, x, y, z, yaw, pitch, roll);
      emit(airTime);
    } else {
      if (Math.abs(cachedHud.air - airTime) > 0.05) emit(airTime);
      return;
    }
  }

  if (hasLastPos) {
    const dx = x - lastX;
    const dy = y - lastY;
    const dz = z - lastZ;
    lineDist += Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  lastX = x;
  lastY = y;
  lastZ = z;
  hasLastPos = true;

  lineT += step;
  if (airTime > 0) {
    lineAir += step;
    if (airTime > lineMaxAir) lineMaxAir = airTime;
  }
  if (speed > lineMaxSpeed) lineMaxSpeed = speed;

  sampleAcc += step;
  if (sampleAcc >= SAMPLE_DT) {
    sampleAcc -= SAMPLE_DT;
    pushSample(lineT, x, y, z, yaw, pitch, roll);
    emit(airTime);
    if (samples.length >= MAX_SAMPLES) {
      commitLine(airTime);
      return;
    }
  } else if (
    Math.abs(cachedHud.air - airTime) > 0.08 ||
    Math.abs(cachedHud.lineDist - lineDist) > 1.5
  ) {
    emit(airTime);
  }

  if (speed < MIN_SPEED_END) {
    idleAcc += step;
    if (idleAcc >= IDLE_END_S) {
      commitLine(airTime);
      return;
    }
  } else {
    idleAcc = 0;
  }
}

/** Hard stop — teleport, quit, or pause. Commits a worthy line. */
export function endGhostLine(): void {
  if (recording) commitLine(0);
  else if (cachedHud.air > 0) emit(0);
}

/** Clear session PB ghost (e.g. quit to menu). */
export function resetGhostSession(): void {
  clearLineBuffers();
  sessionBestAir = 0;
  bestLine = null;
  emit(0);
}

export function getGhostLine(): GhostLine | null {
  return bestLine;
}

export function getLineHud(): LineHud {
  return cachedHud;
}

export function subscribeLineHud(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Sample a saved line at time `t` (loops). Returns false if empty. */
export function sampleGhostPose(
  line: GhostLine,
  t: number,
  out: {
    x: number;
    y: number;
    z: number;
    yaw: number;
    pitch: number;
    roll: number;
  },
): boolean {
  const s = line.samples;
  if (s.length === 0) return false;
  if (s.length === 1) {
    const a = s[0]!;
    out.x = a.x;
    out.y = a.y;
    out.z = a.z;
    out.yaw = a.yaw;
    out.pitch = a.pitch;
    out.roll = a.roll;
    return true;
  }

  const dur = line.duration > 1e-6 ? line.duration : s[s.length - 1]!.t;
  let u = t % dur;
  if (u < 0) u += dur;

  let lo = 0;
  let hi = s.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (s[mid]!.t <= u) lo = mid;
    else hi = mid;
  }

  const a = s[lo]!;
  const b = s[hi]!;
  const span = b.t - a.t;
  const alpha = span > 1e-8 ? (u - a.t) / span : 0;
  out.x = a.x + (b.x - a.x) * alpha;
  out.y = a.y + (b.y - a.y) * alpha;
  out.z = a.z + (b.z - a.z) * alpha;
  out.yaw = lerpAngle(a.yaw, b.yaw, alpha);
  out.pitch = a.pitch + (b.pitch - a.pitch) * alpha;
  out.roll = a.roll + (b.roll - a.roll) * alpha;
  return true;
}

function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

/** Test helpers — not used by the game loop. */
export const _test = {
  SAMPLE_DT,
  MIN_SPEED_START,
  MIN_SPEED_END,
  IDLE_END_S,
  MIN_LINE_DIST,
  MIN_LINE_SAMPLES,
  lineScore,
  getBestLine: () => bestLine,
  isRecording: () => recording,
  getSamples: () => samples,
};
