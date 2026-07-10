import { describe, expect, test } from "bun:test";
import {
  ANCHOR_CRATERS,
  LUNAR_GENERATORS,
  curvatureDrop,
  sampleHeight,
  sampleNormal,
} from "./terrain";

describe("infinite lunar surface", () => {
  test("generators are registered", () => {
    expect(LUNAR_GENERATORS.length).toBeGreaterThanOrEqual(4);
    expect(LUNAR_GENERATORS.map((g) => g.name)).toContain("craterField");
    expect(LUNAR_GENERATORS.map((g) => g.name)).toContain("anchorBowls");
  });

  test("height is defined far from origin", () => {
    const y = sampleHeight(2400, -1800);
    expect(Number.isFinite(y)).toBe(true);
    expect(Math.abs(y)).toBeLessThan(40);
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
    expect(near).toBeCloseTo(10 * 10 / (2 * 620), 5);
  });
});
