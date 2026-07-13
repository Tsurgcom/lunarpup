import { beforeEach, describe, expect, test } from "bun:test";
import {
  _test,
  endGhostLine,
  getGhostLine,
  getLineHud,
  resetGhostSession,
  sampleGhostPose,
  tickGhostLine,
} from "./ghostLine";

const { MIN_SPEED_START, SAMPLE_DT, IDLE_END_S, MIN_LINE_DIST } = _test;

function skate(
  seconds: number,
  speed: number,
  opts: { airborne?: boolean; step?: number } = {},
): void {
  const step = opts.step ?? SAMPLE_DT;
  const airborne = opts.airborne ?? false;
  let t = 0;
  let x = 0;
  let airTime = 0;
  while (t < seconds) {
    x += speed * step;
    if (airborne) airTime += step;
    else airTime = 0;
    tickGhostLine(x, 0, 300, 0, 0, 0, airTime, speed, step);
    t += step;
  }
}

describe("ghost line recording", () => {
  beforeEach(() => {
    resetGhostSession();
  });

  test("does not start below speed threshold", () => {
    tickGhostLine(0, 0, 300, 0, 0, 0, 0, MIN_SPEED_START - 0.2, SAMPLE_DT);
    expect(_test.isRecording()).toBe(false);
    expect(getGhostLine()).toBeNull();
  });

  test("starts a line when speed rises and commits after idle", () => {
    skate(2.5, 4);
    expect(_test.isRecording()).toBe(true);
    expect(getLineHud().recording).toBe(true);
    expect(getLineHud().lineDist).toBeGreaterThan(MIN_LINE_DIST);

    // Come to rest long enough to commit.
    skate(IDLE_END_S + 0.3, 0.2);
    expect(_test.isRecording()).toBe(false);
    const line = getGhostLine();
    expect(line).not.toBeNull();
    expect(line!.distance).toBeGreaterThan(MIN_LINE_DIST);
    expect(line!.samples.length).toBeGreaterThan(10);
  });

  test("tracks airtime streaks and session best", () => {
    skate(0.5, 3, { airborne: false });
    skate(1.2, 3, { airborne: true });
    expect(getLineHud().air).toBeGreaterThan(1.0);
    expect(getLineHud().bestAir).toBeGreaterThan(1.0);

    skate(0.2, 3, { airborne: false });
    expect(getLineHud().air).toBe(0);

    skate(0.8, 3, { airborne: true });
    expect(getLineHud().bestAir).toBeGreaterThan(1.0);
  });

  test("endGhostLine commits a worthy in-progress line", () => {
    skate(3, 5);
    expect(_test.isRecording()).toBe(true);
    endGhostLine();
    expect(_test.isRecording()).toBe(false);
    expect(getGhostLine()).not.toBeNull();
  });

  test("hasGhost after a committed line", () => {
    expect(getLineHud().hasGhost).toBe(false);
    skate(3, 5);
    endGhostLine();
    expect(getLineHud().hasGhost).toBe(true);
  });

  test("sampleGhostPose lerps and loops", () => {
    skate(2, 4);
    endGhostLine();
    const line = getGhostLine()!;
    const out = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0 };

    expect(sampleGhostPose(line, 0, out)).toBe(true);
    const x0 = out.x;

    expect(sampleGhostPose(line, line.duration * 0.5, out)).toBe(true);
    expect(out.x).not.toBe(x0);

    expect(sampleGhostPose(line, line.duration + 0.01, out)).toBe(true);
    expect(out.x).toBeCloseTo(x0, 0);
  });

  test("keeps the higher-scoring line as best", () => {
    skate(2, 4);
    endGhostLine();
    const first = getGhostLine()!;
    expect(first.distance).toBeGreaterThan(0);

    // Longer, faster line should replace PB.
    skate(5, 6);
    endGhostLine();
    const best = _test.getBestLine()!;
    expect(best.distance).toBeGreaterThan(first.distance);
  });
});
