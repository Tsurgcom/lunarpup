import { describe, expect, test } from "bun:test";
import * as THREE from "three";
import {
  ANCHOR_CRATERS,
  CURVATURE_RADIUS,
  LUNAR_GENERATORS,
  MOON_HALF,
  MOON_SIZE,
  curvatureDrop,
  globeHitToWorld,
  sampleHeight,
  sampleNormal,
  worldToGlobe,
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

  test("globe chart round-trips world points", () => {
    const samples: Array<[number, number]> = [
      [0, 14],
      [120, -80],
      [MOON_HALF - 5, 0],
      [-40, MOON_HALF - 8],
    ];
    for (const [x, z] of samples) {
      const dir = worldToGlobe(x, z, 1, new THREE.Vector3(), 0);
      const back = globeHitToWorld(dir);
      expect(back).not.toBeNull();
      expect(wrapDelta(back!.x, wrapCoord(x))).toBeCloseTo(0, 4);
      expect(wrapDelta(back!.z, wrapCoord(z))).toBeCloseTo(0, 4);
    }
  });

  test("map pin stays continuous while circling the south pole", () => {
    const out = new THREE.Vector3();
    const prev = new THREE.Vector3();
    let maxJump = 0;
    // Constant latitude near the south edge — full longitude lap.
    const z = -MOON_HALF + 15;
    for (let i = 0; i <= 100; i++) {
      const x = -MOON_HALF + (i / 100) * MOON_SIZE;
      worldToGlobe(x, z, 1, out, 0);
      if (i > 0) maxJump = Math.max(maxJump, prev.distanceTo(out));
      prev.copy(out);
    }
    expect(maxJump).toBeLessThan(0.08);
  });
});
