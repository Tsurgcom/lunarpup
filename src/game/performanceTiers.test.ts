import { describe, expect, test } from "bun:test";
import {
  getPerfOverride,
  getPerfOverrideLabel,
  getPerfSettings,
  PERF_DOWN_HOLD_MS,
  PERF_TIERS,
  PERF_UP_HOLD_MS,
  PERF_WARMUP_MS,
  resetPerformanceTier,
  scaleLodSubdiv,
  setPerfOverride,
  setPerfTier,
  tickPerformanceTier,
} from "./performanceTiers";

function advance(ms: number, dt = 16.67): void {
  const steps = Math.ceil(ms / dt);
  for (let i = 0; i < steps; i++) tickPerformanceTier(dt);
}

describe("performanceTiers", () => {
  test("boots at the lowest tier", () => {
    setPerfOverride("auto");
    resetPerformanceTier();
    expect(getPerfSettings().tier).toBe(0);
    expect(getPerfSettings().name).toBe("low");
    expect(getPerfSettings()).toEqual(PERF_TIERS[0]!);
    expect(getPerfOverrideLabel()).toBe("Auto (Low)");
  });

  test("scaleLodSubdiv floors to a usable minimum", () => {
    expect(scaleLodSubdiv(40, 0.45)).toBe(18);
    expect(scaleLodSubdiv(4, 0.45)).toBe(2);
    expect(scaleLodSubdiv(40, 1)).toBe(40);
    expect(scaleLodSubdiv(40, 4)).toBe(160);
  });

  test("high doubles clipmap subdiv", () => {
    expect(PERF_TIERS[2]!.lodSubdivScale).toBe(2);
  });

  test("ultra quadruples clipmap subdiv", () => {
    expect(PERF_TIERS[3]!.lodSubdivScale).toBe(4);
  });

  test("climbs after warm-up when fps stays high", () => {
    setPerfOverride("auto");
    resetPerformanceTier();
    setPerfTier(0);
    // Warm-up at ~60fps — must not climb yet.
    advance(PERF_WARMUP_MS - 50, 16.67);
    expect(getPerfSettings().tier).toBe(0);

    advance(PERF_UP_HOLD_MS + 200, 16.67);
    expect(getPerfSettings().tier).toBeGreaterThan(0);
  });

  test("drops when fps collapses after warm-up", () => {
    setPerfOverride("auto");
    resetPerformanceTier();
    setPerfTier(2);
    // Warm up while already at tier 2.
    advance(PERF_WARMUP_MS + 100, 16.67);
    expect(getPerfSettings().tier).toBe(2);

    // ~25fps long enough for the EMA to fall below the down threshold
    // and then hold the drop window.
    advance(PERF_DOWN_HOLD_MS + 2500, 40);
    expect(getPerfSettings().tier).toBeLessThan(2);
  });

  test("setPerfTier respects the current max via direct set", () => {
    setPerfOverride("auto");
    resetPerformanceTier();
    setPerfTier(3);
    expect(getPerfSettings().tier).toBeLessThanOrEqual(3);
    expect(getPerfSettings().name).toBe(
      PERF_TIERS[getPerfSettings().tier]!.name,
    );
  });

  test("manual override locks tier and ignores fps swings", () => {
    setPerfOverride("auto");
    resetPerformanceTier();
    setPerfOverride(3);
    expect(getPerfOverride()).toBe(3);
    expect(getPerfSettings().tier).toBe(3);
    expect(getPerfOverrideLabel()).toBe("Ultra");

    advance(PERF_WARMUP_MS + PERF_DOWN_HOLD_MS + 3000, 40);
    expect(getPerfSettings().tier).toBe(3);

    setPerfOverride("auto");
    expect(getPerfOverride()).toBe("auto");
    expect(getPerfOverrideLabel()).toBe("Auto (Ultra)");
  });

  test("reset preserves a locked override", () => {
    setPerfOverride(1);
    resetPerformanceTier();
    expect(getPerfSettings().tier).toBe(1);
    expect(getPerfOverrideLabel()).toBe("Medium");
    setPerfOverride("auto");
  });
});
