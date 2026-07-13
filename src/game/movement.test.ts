import { describe, expect, test } from "bun:test";
import { MOON_RADIUS, SPAWN_ALTITUDE, spawnPosition } from "./moon";
import { type ControlInput, createPlayer, stepPlayer } from "./movement";

function idleInput(overrides: Partial<ControlInput> = {}): ControlInput {
  return {
    forward: false,
    back: false,
    left: false,
    right: false,
    pitchUp: false,
    pitchDown: false,
    boosting: false,
    ...overrides,
  };
}

describe("free-space movement", () => {
  test("createPlayer spawns at fixed altitude", () => {
    const p = createPlayer();
    const expected = spawnPosition();
    expect(p.pos.distanceTo(expected)).toBeLessThan(1e-6);
    expect(p.pos.length()).toBeCloseTo(MOON_RADIUS + SPAWN_ALTITUDE, 5);
  });

  test("holding W increases speed and moves", () => {
    const p = createPlayer();
    p.vel.set(0, 0, 0);
    const start = p.pos.clone();
    for (let i = 0; i < 60; i++) {
      stepPlayer(p, idleInput({ forward: true }), 1 / 60);
    }
    expect(p.vel.length()).toBeGreaterThan(4);
    expect(p.pos.distanceTo(start)).toBeGreaterThan(2);
  });

  test("A lean increases yaw over time", () => {
    const p = createPlayer();
    const yaw0 = p.yaw;
    for (let i = 0; i < 30; i++) {
      stepPlayer(p, idleInput({ left: true, forward: true }), 1 / 60);
    }
    expect(p.yaw).toBeGreaterThan(yaw0 + 0.2);
    expect(p.lean).toBeGreaterThan(0.5);
  });

  test("coasting without thrust slows down", () => {
    const p = createPlayer();
    p.vel.set(0, 0, 0);
    for (let i = 0; i < 40; i++) {
      stepPlayer(p, idleInput({ forward: true }), 1 / 60);
    }
    const peak = p.vel.length();
    for (let i = 0; i < 120; i++) {
      stepPlayer(p, idleInput(), 1 / 60);
    }
    expect(p.vel.length()).toBeLessThan(peak * 0.5);
  });

  test("does not snap toward the moon center", () => {
    const p = createPlayer();
    const r0 = p.pos.length();
    for (let i = 0; i < 30; i++) {
      stepPlayer(p, idleInput({ forward: true }), 1 / 60);
    }
    // Free space — radius can change, but should not collapse onto the moon.
    expect(p.pos.length()).toBeGreaterThan(MOON_RADIUS);
    expect(Math.abs(p.pos.length() - r0)).toBeLessThan(20);
  });
});
