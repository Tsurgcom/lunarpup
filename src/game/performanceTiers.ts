/**
 * Adaptive performance tiers — start at High, then climb or drop based on
 * sustained fps stability.
 */

export type PerfTierId = 0 | 1 | 2 | 3;

/** `"auto"` = adaptive scaler; otherwise lock to that tier. */
export type PerfOverride = "auto" | PerfTierId;

export type PerfSettings = {
  /** 0 = lowest / safest boot tier. */
  tier: PerfTierId;
  name: "low" | "medium" | "high" | "ultra";
  /** Cap for Canvas `dpr` (device pixel ratio). */
  dpr: number;
  shadows: boolean;
  shadowMapSize: 512 | 1024;
  /**
   * Multiplier on clipmap edge subdiv (1 = full quality).
   * Applied after LOD ring selection so stitch still matches.
   */
  lodSubdivScale: number;
  starCount: number;
  moonWidthSegs: number;
  moonHeightSegs: number;
  /** Chunk meshes attached per render frame. */
  maxChunkAttachPerFrame: number;
};

export const PERF_TIERS: readonly PerfSettings[] = [
  {
    tier: 0,
    name: "low",
    dpr: 1,
    shadows: false,
    shadowMapSize: 512,
    // Tessellation is shared across tiers — changing scale remeshes the whole
    // stream and made Low feel worse than Ultra (climb = remesh storm).
    lodSubdivScale: 1,
    starCount: 220,
    moonWidthSegs: 24,
    moonHeightSegs: 18,
    maxChunkAttachPerFrame: 4,
  },
  {
    tier: 1,
    name: "medium",
    dpr: 1.25,
    shadows: true,
    shadowMapSize: 512,
    lodSubdivScale: 1,
    starCount: 450,
    moonWidthSegs: 40,
    moonHeightSegs: 30,
    maxChunkAttachPerFrame: 4,
  },
  {
    tier: 2,
    name: "high",
    dpr: 1.5,
    shadows: true,
    shadowMapSize: 1024,
    lodSubdivScale: 1,
    starCount: 700,
    moonWidthSegs: 56,
    moonHeightSegs: 42,
    maxChunkAttachPerFrame: 4,
  },
  {
    tier: 3,
    name: "ultra",
    dpr: 2,
    shadows: true,
    shadowMapSize: 1024,
    lodSubdivScale: 1,
    starCount: 900,
    moonWidthSegs: 64,
    moonHeightSegs: 48,
    maxChunkAttachPerFrame: 4,
  },
] as const;

/** Prefer staying near this fps once warm. */
export const PERF_TARGET_FPS = 55;
/** Scale down when smoothed fps dips below this. */
export const PERF_DOWN_FPS = 42;
/** Scale up when smoothed fps stays above this. */
export const PERF_UP_FPS = 58;

/** Ignore adaptive changes during cold start / asset spikes. */
export const PERF_WARMUP_MS = 2000;
/** Require headroom this long before climbing a tier. */
export const PERF_UP_HOLD_MS = 2500;
/** Require pain this long before dropping a tier. */
export const PERF_DOWN_HOLD_MS = 750;
/** Minimum gap between tier changes (avoids thrash). */
export const PERF_COOLDOWN_MS = 1800;

const listeners = new Set<() => void>();

let settings: PerfSettings = PERF_TIERS[2]!;
let override: PerfOverride = "auto";
let fpsEma = 60;
let elapsedMs = 0;
let upHoldMs = 0;
let downHoldMs = 0;
let cooldownMs = 0;
let maxTier: PerfTierId = 3;
let hardwareCapped = false;

function emit(): void {
  for (const l of listeners) l();
}

/** Title-case tier name for UI labels. */
export function formatPerfTierName(
  name: PerfSettings["name"] | PerfTierId = settings.name,
): string {
  const key =
    typeof name === "number" ? (PERF_TIERS[name]?.name ?? "low") : name;
  return key.charAt(0).toUpperCase() + key.slice(1);
}

/** Cap the climb based on rough device hints (cores / RAM). */
export function detectHardwareMaxTier(): PerfTierId {
  if (typeof navigator === "undefined") return 3;
  const cores = navigator.hardwareConcurrency || 4;
  const memory =
    "deviceMemory" in navigator
      ? (navigator as Navigator & { deviceMemory?: number }).deviceMemory
      : undefined;

  let cap: PerfTierId = 3;
  if (memory !== undefined && memory > 0 && memory <= 2) cap = 1;
  else if (memory !== undefined && memory > 0 && memory <= 4) cap = 2;
  if (cores <= 2) cap = Math.min(cap, 1) as PerfTierId;
  else if (cores <= 4) cap = Math.min(cap, 2) as PerfTierId;
  return cap;
}

export function getPerfSettings(): PerfSettings {
  return settings;
}

export function getPerfTier(): PerfTierId {
  return settings.tier;
}

export function getPerfFpsSmooth(): number {
  return fpsEma;
}

export function getPerfMaxTier(): PerfTierId {
  return maxTier;
}

export function getPerfOverride(): PerfOverride {
  return override;
}

/** True when the adaptive scaler is driving the tier. */
export function isPerfAuto(): boolean {
  return override === "auto";
}

/**
 * Closed-trigger label for Options.
 * Auto shows the live adaptive mode in brackets: `Auto (High)`.
 */
export function getPerfOverrideLabel(): string {
  if (override === "auto") {
    return `Auto (${formatPerfTierName(settings.name)})`;
  }
  return formatPerfTierName(override);
}

export function subscribePerf(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function setTier(tier: PerfTierId, clampToHardware: boolean): void {
  const capped = clampToHardware
    ? (Math.min(tier, maxTier) as PerfTierId)
    : tier;
  const next = PERF_TIERS[capped]!;
  if (next.tier === settings.tier) return;
  settings = next;
  cooldownMs = PERF_COOLDOWN_MS;
  upHoldMs = 0;
  downHoldMs = 0;
  emit();
}

/** Force a tier (tests / debug). Clamped to the hardware max. */
export function setPerfTier(tier: PerfTierId): void {
  setTier(tier, true);
}

/**
 * Options override. `"auto"` resumes adaptive scaling from the current tier;
 * a numeric id locks quality immediately (ignores hardware max).
 */
export function setPerfOverride(next: PerfOverride): void {
  if (next === override) {
    if (next !== "auto") setTier(next, false);
    return;
  }
  override = next;
  upHoldMs = 0;
  downHoldMs = 0;
  cooldownMs = 0;
  if (next === "auto") {
    // Keep current settings; adaptive resumes from here.
    emit();
    return;
  }
  settings = PERF_TIERS[next]!;
  emit();
}

/**
 * Reset adaptive state and re-probe hardware. Preserves the Options override:
 * auto boots at High (clamped to the hardware max) then scales up/down from
 * fps stability; a locked tier reapplies itself.
 */
export function resetPerformanceTier(): void {
  if (!hardwareCapped) {
    maxTier = detectHardwareMaxTier();
    hardwareCapped = true;
  }
  fpsEma = 60;
  elapsedMs = 0;
  upHoldMs = 0;
  downHoldMs = 0;
  cooldownMs = 0;
  if (override === "auto") {
    const boot = Math.min(2, maxTier) as PerfTierId;
    settings = PERF_TIERS[boot]!;
  } else {
    settings = PERF_TIERS[override]!;
  }
  emit();
}

/**
 * Apply the active tier's subdiv scale. Keeps a usable minimum so faces
 * don't collapse to degenerate tessellation.
 */
export function scaleLodSubdiv(
  subdiv: number,
  scale = settings.lodSubdivScale,
): number {
  return Math.max(2, Math.round(subdiv * scale));
}

/**
 * Feed one render-frame dt. Updates the fps EMA and maybe steps the tier.
 * Safe to call every frame from inside the Canvas.
 */
export function tickPerformanceTier(dtMs: number): PerfSettings {
  if (!hardwareCapped) {
    maxTier = detectHardwareMaxTier();
    hardwareCapped = true;
  }

  const dt = Math.min(Math.max(dtMs, 0), 100);
  elapsedMs += dt;
  if (cooldownMs > 0) cooldownMs = Math.max(0, cooldownMs - dt);

  const fps = dt > 1e-4 ? 1000 / dt : 0;
  const alpha = 1 - Math.exp(-(dt / 1000) * 2.2);
  fpsEma += (fps - fpsEma) * alpha;

  // Manual Options lock — still track fps for the debug panel.
  if (override !== "auto") {
    return settings;
  }

  if (elapsedMs < PERF_WARMUP_MS || cooldownMs > 0) {
    return settings;
  }

  const tier = settings.tier;

  if (fpsEma < PERF_DOWN_FPS && tier > 0) {
    downHoldMs += dt;
    upHoldMs = 0;
    if (downHoldMs >= PERF_DOWN_HOLD_MS) {
      setTier((tier - 1) as PerfTierId, true);
    }
    return settings;
  }

  if (fpsEma > PERF_UP_FPS && tier < maxTier) {
    upHoldMs += dt;
    downHoldMs = 0;
    if (upHoldMs >= PERF_UP_HOLD_MS) {
      setTier((tier + 1) as PerfTierId, true);
    }
    return settings;
  }

  upHoldMs = 0;
  downHoldMs = 0;
  return settings;
}
