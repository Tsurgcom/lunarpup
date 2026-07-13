import { describe, expect, test } from "bun:test";
import { MOON_RADIUS } from "./moon";
import { type ControlInput, createPlayer, stepPlayer } from "./movement";
import {
  BOARD_CLEARANCE,
  JUMP_SPEED,
  SOFT_BAND,
  signedAltitude,
} from "./rideShell";

function idleInput(overrides: Partial<ControlInput> = {}): ControlInput {
  return {
    forward: false,
    back: false,
    left: false,
    right: false,
    pitchUp: false,
    pitchDown: false,
    boosting: false,
    jump: false,
    ...overrides,
  };
}

describe("ride-shell movement", () => {
  test("createPlayer spawns on a short drop-in above the ride shell", () => {
    const p = createPlayer();
    expect(signedAltitude(p.pos)).toBeGreaterThan(SOFT_BAND);
    expect(signedAltitude(p.pos)).toBeLessThan(SOFT_BAND + 3);
    expect(p.pos.length()).toBeGreaterThan(MOON_RADIUS + BOARD_CLEARANCE);
  });

  test("idle fall plants on the ride shell", () => {
    const p = createPlayer();
    p.vel.set(0, 0, 0);
    for (let i = 0; i < 180; i++) {
      stepPlayer(p, idleInput(), 1 / 60);
    }
    expect(p.grounded).toBe(true);
    expect(signedAltitude(p.pos)).toBeLessThan(SOFT_BAND);
    expect(signedAltitude(p.pos)).toBeGreaterThan(-0.4);
    // Settled — not oscillating hard through the shell.
    const h0 = signedAltitude(p.pos);
    for (let i = 0; i < 60; i++) {
      stepPlayer(p, idleInput(), 1 / 60);
    }
    expect(Math.abs(signedAltitude(p.pos) - h0)).toBeLessThan(0.25);
    expect(p.grounded).toBe(true);
  });

  test("holding W while planted increases tangential speed", () => {
    const p = createPlayer();
    p.vel.set(0, 0, 0);
    for (let i = 0; i < 180; i++) {
      stepPlayer(p, idleInput(), 1 / 60);
    }
    expect(p.grounded).toBe(true);
    const start = p.pos.clone();
    for (let i = 0; i < 60; i++) {
      stepPlayer(p, idleInput({ forward: true }), 1 / 60);
    }
    expect(p.vel.length()).toBeGreaterThan(4);
    expect(p.pos.distanceTo(start)).toBeGreaterThan(2);
    expect(p.grounded).toBe(true);
  });

  test("A lean increases yaw over time", () => {
    const p = createPlayer();
    p.vel.set(0, 0, 0);
    for (let i = 0; i < 180; i++) {
      stepPlayer(p, idleInput(), 1 / 60);
    }
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
    for (let i = 0; i < 180; i++) {
      stepPlayer(p, idleInput(), 1 / 60);
    }
    for (let i = 0; i < 40; i++) {
      stepPlayer(p, idleInput({ forward: true }), 1 / 60);
    }
    const peak = p.vel.length();
    for (let i = 0; i < 120; i++) {
      stepPlayer(p, idleInput(), 1 / 60);
    }
    expect(p.vel.length()).toBeLessThan(peak * 0.5);
  });

  test("jump clears the soft band", () => {
    const p = createPlayer();
    p.vel.set(0, 0, 0);
    for (let i = 0; i < 180; i++) {
      stepPlayer(p, idleInput(), 1 / 60);
    }
    expect(p.grounded).toBe(true);
    stepPlayer(p, idleInput({ jump: true }), 1 / 60);
    expect(p.grounded).toBe(false);
    expect(p.vel.dot(p.contactNormal)).toBeGreaterThan(JUMP_SPEED * 0.8);
    for (let i = 0; i < 8; i++) {
      stepPlayer(p, idleInput(), 1 / 60);
    }
    expect(signedAltitude(p.pos)).toBeGreaterThan(SOFT_BAND);
  });

  test("does not tunnel through the shell at high inward speed", () => {
    const p = createPlayer();
    p.pos.copy(p.up).multiplyScalar(MOON_RADIUS + BOARD_CLEARANCE + 2);
    p.vel.copy(p.up).multiplyScalar(-80);
    for (let i = 0; i < 30; i++) {
      stepPlayer(p, idleInput(), 1 / 60);
    }
    expect(signedAltitude(p.pos)).toBeGreaterThan(-0.5);
    expect(p.pos.length()).toBeGreaterThan(MOON_RADIUS);
  });
});
