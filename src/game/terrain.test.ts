import { describe, expect, test } from "bun:test";
import * as THREE from "three";
import {
  ANCHOR_CRATERS,
  CHART_HALF,
  CURVATURE_RADIUS,
  LUNAR_GENERATORS,
  MOON_HALF,
  MOON_SIZE,
  chartHitToWorld,
  curvatureDrop,
  sampleHeight,
  sampleNormal,
  worldToChart,
  worldToChartScale,
  wrapCoord,
  wrapDelta,
} from "./terrain";

describe("finite lunar surface", () => {
  test("generators are registered", () => {
    expect(LUNAR_GENERATORS.length).toBeGreaterThanOrEqual(4);
    expect(LUNAR_GENERATORS.map((g) => g.name)).toContain("craterField");
    expect(LUNAR_GENERATORS.map((g) => g.name)).toContain("anchorBowls");
  });

  test("world wraps onto a finite moon", () => {
    expect(wrapCoord(MOON_HALF)).toBeCloseTo(-MOON_HALF, 8);
    expect(wrapCoord(-MOON_HALF - 1)).toBeCloseTo(MOON_HALF - 1, 8);
    expect(wrapCoord(0)).toBe(0);
    expect(Math.abs(wrapDelta(MOON_HALF - 1, -MOON_HALF + 1))).toBeLessThan(3);
  });

  test("height matches across the wrap seam", () => {
    const a = sampleHeight(MOON_HALF - 0.5, 12);
    const b = sampleHeight(-MOON_HALF - 0.5, 12);
    expect(a).toBeCloseTo(b, 5);
  });

  test("anchor bowl still digs the spawn crater", () => {
    const rim = sampleHeight(18, 0);
    const floor = sampleHeight(0, 0);
    expect(floor).toBeLessThan(rim - 3);
    expect(ANCHOR_CRATERS[0]?.depth).toBeGreaterThan(5);
  });

  test("normals stay unit length on procedural ground", () => {
    const n = sampleNormal(120, -80);
    expect(n.length()).toBeCloseTo(1, 5);
    expect(n.y).toBeGreaterThan(0.2);
  });

  test("curvature drop increases with viewer distance", () => {
    const near = curvatureDrop(10, 0, 0, 0);
    const far = curvatureDrop(100, 0, 0, 0);
    expect(far).toBeGreaterThan(near);
    expect(near).toBeCloseTo((10 * 10) / (2 * CURVATURE_RADIUS), 5);
    expect(MOON_SIZE).toBe(480);
  });

  test("chart maps world XZ 1:1", () => {
    const s = worldToChartScale();
    expect(s).toBeCloseTo((CHART_HALF * 2) / MOON_SIZE, 10);

    const samples: Array<[number, number]> = [
      [0, 14],
      [120, -80],
      [MOON_HALF - 5, 0],
      [-40, MOON_HALF - 8],
    ];
    for (const [x, z] of samples) {
      const p = worldToChart(x, z, new THREE.Vector3(), 0);
      expect(p.x).toBeCloseTo(wrapCoord(x) * s, 6);
      expect(p.z).toBeCloseTo(wrapCoord(z) * s, 6);
      const back = chartHitToWorld(p);
      expect(wrapDelta(back.x, wrapCoord(x))).toBeCloseTo(0, 4);
      expect(wrapDelta(back.z, wrapCoord(z))).toBeCloseTo(0, 4);
    }
  });

  test("chart pin stays continuous across the date-line seam", () => {
    const out = new THREE.Vector3();
    const prev = new THREE.Vector3();
    let maxJump = 0;
    const z = 20;
    // Walk just inside the +X edge, then continue from the -X image.
    for (let i = 0; i <= 40; i++) {
      const t = i / 40;
      const x =
        t < 0.5
          ? MOON_HALF - 8 + t * 16
          : -MOON_HALF + (t - 0.5) * 16;
      worldToChart(x, z, out, 0);
      if (i > 0) {
        // Wrapped chart coords jump at the seam — that is correct for a
        // square chart. Continuity is in world space via wrapDelta.
        const dx = wrapDelta(out.x / worldToChartScale(), prev.x / worldToChartScale());
        const dz = wrapDelta(out.z / worldToChartScale(), prev.z / worldToChartScale());
        maxJump = Math.max(maxJump, Math.hypot(dx, dz) * worldToChartScale());
      }
      prev.copy(out);
    }
    expect(maxJump).toBeLessThan(0.05);
  });
});
