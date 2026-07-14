/**
 * Live-tunable ride / movement / camera characteristics.
 * Enable the HUD panel with `?tweaking` on the URL.
 *
 * Arcade knobs are ported from v1 `runtime.ts` defaults. Absolute force /
 * spring / mass values stay v3-sphere-tuned — v1's flat hover-pad units do
 * not map 1:1 onto the ride shell.
 */

/** v1 maxSpeed → v3 m/s scale (v1 was unitless ~1.25). */
const V1_SPEED = 1.25;
const V3_SPEED = 40;
const SPEED_SCALE = V3_SPEED / V1_SPEED;

export const DEFAULT_PHYSICS = {
  // —— Sphere integrator (keep v3; not v1 mass/thrustForce units) ——
  mass: 18,
  thrust: 220,
  drag: 0.04,
  coastFriction: 8,
  airCoast: 2.5,
  boardClearance: 0.14,
  softBand: 0.7,
  /** Snappier arc so air commits to a clean plant. */
  gLunar: 3.85,
  /**
   * Extra gravity scale while descending (0 = off). Guarantees flights
   * fall through instead of hanging at the apex.
   */
  descentGravityBoost: 0.45,
  compressStiffness: 3600,
  softStiffness: 62,
  normalDamping: 300,
  maxPenetration: 0.4,

  // —— v1 arcade drive (runtime.ts) ——
  /** v1 reverse was hard-coded 0.85 of thrust. */
  reverseMult: 0.85,
  /** v1 boostMultiplier. */
  boostMult: 1.95,
  /** v1 boostAccelMultiplier. */
  boostAccelMult: 2.45,
  /** v1 airThrustMultiplier. */
  airThrustFade: 0.82,
  /** Lateral damping rate (1/s). V3 model — v1 used constant slideGrip accel. */
  lateralGrip: 6,
  /** v1 driftThreshold (0.2) × speed scale. */
  driftThreshold: 0.2 * SPEED_SCALE,
  /** v1 driftGripMultiplier. */
  driftGripMult: 0.38,
  /** v1 driftSlideMultiplier (extra tangent gravity fraction). */
  slopeSlide: 0.06,
  /**
   * v1 rotationSpeed 0.058 × 60 fps → rad/s at full lean / zero speed.
   */
  steerRate: 0.058 * 60,
  /** Speed (m/s) where steer falls to half — v3 shaping around cruise. */
  steerSpeedHalf: V3_SPEED * 0.35,
  /** v1 airTurnMultiplier. */
  airTurnMult: 1.45,
  /**
   * Air lateral bleed (1/s). Scaled from v1 airSteer/slideGrip ratio onto
   * lateralGrip (0.012 / 0.018).
   */
  airSteerGrip: 6 * (0.012 / 0.018),
  /** v1 airHoverAssist. */
  airHoverAssist: 0.55,
  /**
   * Soft re-plant gate (m/s outward). Kept well below jumpSpeed so sphere
   * jumps don't instantly re-ground (v1 hoverLanding 0.28 > jump 0.16 does
   * not port safely onto this contact model).
   */
  /** Slightly forgiving re-plant so touchdowns stick. */
  landingCatchSpeed: 0.7,
  maxSpeed: V3_SPEED,
  /** v1 jumpImpulse 0.16 / maxSpeed → m/s. */
  jumpSpeed: (0.16 / V1_SPEED) * V3_SPEED,
  /** v1 COYOTE_TIME_MS = 100. */
  coyoteTime: 0.1,
  /** v1 JUMP_BUFFER_MS = 150. */
  jumpBuffer: 0.15,

  // —— Board attitude (v3 lean/pitch rates; angles from v1 board tilt amp) ——
  pitchRate: 2.2,
  upTrack: 9,
  upTrackSoft: 4,
  leanEngage: 5.5,
  leanRecover: 3.2,
  pitchEngage: 5.5,
  pitchRecover: 3.2,
  /** Visual lean amp — between v1 turn lean 0.16 and a readable board tip. */
  leanAngle: 0.44,
  pitchAngle: 0.4,

  // —— Camera: close seat + radical FOV with dolly framing ——
  cameraBaseFov: 55,
  cameraMaxFov: 98,
  fovSmoothing: 0.085,
  /** ~2× closer than the old 15m chase seat. */
  cameraDistance: 7,
  cameraMinDist: 3,
  cameraMaxDist: 22,
  /** Softer auto-yaw settle — less sticky, easier on the player. */
  autoFollow: 0.014,
  /** v1 follow engages above |displaySpeed| 0.03 → fraction of maxSpeed. */
  followSpeed: (0.03 / V1_SPEED) * V3_SPEED,
  /** Extra chase distance at full hang (m). Keep near 0 — FOV + dolly hold size. */
  camAirDist: 0.2,
  /** Pitch rise while airborne (rad added to default seat). */
  camAirPitch: 0.2,
  /** FOV open at full hang (deg added). */
  camAirFov: 18,
  /** Touchdown shift-out distance (m × punch). */
  camLandDist: 2.2,
  /** Touchdown FOV punch (deg × punch). */
  camLandFov: 14,
} as const;

export type PhysicsKey = keyof typeof DEFAULT_PHYSICS;

export type PhysicsValues = Record<PhysicsKey, number>;

/** Mutable live values — written by the tweaking panel, read by the integrator. */
export const physics: PhysicsValues = { ...DEFAULT_PHYSICS };

export const tuningSettings = [
  { key: "mass", label: "Mass", min: 5, max: 80, step: 1 },
  { key: "thrust", label: "Thrust", min: 40, max: 600, step: 5 },
  { key: "reverseMult", label: "Reverse", min: 0.2, max: 1.2, step: 0.05 },
  { key: "boostMult", label: "Boost top", min: 1, max: 3.5, step: 0.05 },
  {
    key: "boostAccelMult",
    label: "Boost accel",
    min: 1,
    max: 4,
    step: 0.05,
  },
  { key: "drag", label: "Drag", min: 0, max: 0.2, step: 0.005 },
  { key: "coastFriction", label: "Coast friction", min: 0, max: 30, step: 0.5 },
  { key: "airCoast", label: "Air coast", min: 0, max: 15, step: 0.25 },
  { key: "airThrustFade", label: "Air thrust", min: 0, max: 1.5, step: 0.02 },
  { key: "lateralGrip", label: "Lateral grip", min: 0, max: 20, step: 0.25 },
  {
    key: "driftThreshold",
    label: "Drift threshold",
    min: 0,
    max: 25,
    step: 0.5,
  },
  {
    key: "driftGripMult",
    label: "Drift grip",
    min: 0.05,
    max: 1,
    step: 0.02,
  },
  { key: "slopeSlide", label: "Slope slide", min: 0, max: 0.5, step: 0.01 },
  { key: "steerRate", label: "Steer rate", min: 0.5, max: 8, step: 0.1 },
  { key: "steerSpeedHalf", label: "Steer v½", min: 2, max: 40, step: 0.5 },
  { key: "airTurnMult", label: "Air turn", min: 0.5, max: 3, step: 0.05 },
  {
    key: "airSteerGrip",
    label: "Air steer grip",
    min: 0,
    max: 8,
    step: 0.1,
  },
  {
    key: "airHoverAssist",
    label: "Air hover assist",
    min: 0,
    max: 1.5,
    step: 0.05,
  },
  {
    key: "landingCatchSpeed",
    label: "Landing catch",
    min: 0.05,
    max: 2,
    step: 0.05,
  },
  { key: "pitchRate", label: "Pitch rate", min: 0.4, max: 6, step: 0.1 },
  { key: "upTrack", label: "Up track", min: 1, max: 24, step: 0.5 },
  { key: "upTrackSoft", label: "Up track soft", min: 0.5, max: 16, step: 0.25 },
  { key: "leanEngage", label: "Lean engage", min: 1, max: 16, step: 0.25 },
  { key: "leanRecover", label: "Lean recover", min: 0.5, max: 12, step: 0.25 },
  { key: "pitchEngage", label: "Pitch engage", min: 1, max: 16, step: 0.25 },
  {
    key: "pitchRecover",
    label: "Pitch recover",
    min: 0.5,
    max: 12,
    step: 0.25,
  },
  { key: "leanAngle", label: "Lean angle", min: 0.1, max: 1.2, step: 0.02 },
  { key: "pitchAngle", label: "Pitch angle", min: 0.1, max: 1.2, step: 0.02 },
  { key: "maxSpeed", label: "Max speed", min: 10, max: 80, step: 1 },
  {
    key: "boardClearance",
    label: "Board clearance",
    min: 0.05,
    max: 0.5,
    step: 0.01,
  },
  { key: "softBand", label: "Soft band", min: 0.15, max: 2, step: 0.05 },
  { key: "gLunar", label: "Gravity", min: 0.5, max: 12, step: 0.1 },
  {
    key: "descentGravityBoost",
    label: "Descent g boost",
    min: 0,
    max: 1.5,
    step: 0.05,
  },
  {
    key: "compressStiffness",
    label: "Compress k",
    min: 400,
    max: 12000,
    step: 50,
  },
  { key: "softStiffness", label: "Soft k", min: 5, max: 200, step: 1 },
  { key: "normalDamping", label: "Normal damp", min: 20, max: 800, step: 10 },
  { key: "maxPenetration", label: "Max pen.", min: 0.1, max: 1.2, step: 0.05 },
  { key: "jumpSpeed", label: "Jump speed", min: 2, max: 18, step: 0.25 },
  { key: "coyoteTime", label: "Coyote time", min: 0, max: 0.4, step: 0.01 },
  { key: "jumpBuffer", label: "Jump buffer", min: 0, max: 0.4, step: 0.01 },
  { key: "cameraBaseFov", label: "Base FOV", min: 40, max: 85, step: 1 },
  { key: "cameraMaxFov", label: "Fast FOV", min: 60, max: 120, step: 1 },
  { key: "fovSmoothing", label: "FOV smooth", min: 0.02, max: 0.4, step: 0.01 },
  {
    key: "cameraDistance",
    label: "Cam distance",
    min: 2,
    max: 20,
    step: 0.25,
  },
  { key: "cameraMinDist", label: "Cam min", min: 1.5, max: 10, step: 0.25 },
  { key: "cameraMaxDist", label: "Cam max", min: 8, max: 40, step: 1 },
  {
    key: "autoFollow",
    label: "Auto follow",
    min: 0.005,
    max: 0.15,
    step: 0.005,
  },
  { key: "followSpeed", label: "Follow speed", min: 0.1, max: 5, step: 0.1 },
  { key: "camAirDist", label: "Air cam dist", min: -2, max: 8, step: 0.25 },
  { key: "camAirPitch", label: "Air cam pitch", min: 0, max: 0.5, step: 0.01 },
  { key: "camAirFov", label: "Air FOV+", min: 0, max: 30, step: 0.5 },
  { key: "camLandDist", label: "Land cam dist", min: 0, max: 10, step: 0.25 },
  { key: "camLandFov", label: "Land FOV+", min: 0, max: 24, step: 0.5 },
] as const satisfies ReadonlyArray<{
  key: PhysicsKey;
  label: string;
  min: number;
  max: number;
  step: number;
}>;

export function readPhysicsValues(): PhysicsValues {
  return { ...physics };
}

export function setPhysicsValue(key: PhysicsKey, value: number): void {
  physics[key] = value;
}

export function resetPhysics(): void {
  Object.assign(physics, DEFAULT_PHYSICS);
}

export function formatPhysicsSnippet(values: PhysicsValues): string {
  const lines = tuningSettings
    .map((s) => `  ${s.key}: ${values[s.key]},`)
    .join("\n");
  return `// Paste into DEFAULT_PHYSICS:\n{\n${lines}\n}`;
}

/** True when `?tweaking` is on the URL. */
export function isTweakingEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).has("tweaking");
}
