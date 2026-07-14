import { describe, expect, test } from "bun:test";
import * as THREE from "three";
import { MOON_RADIUS } from "./moon";
import {
  boardAxes,
  type ControlInput,
  createPlayer,
  getSpeedRatio,
  stepPlayer,
} from "./movement";
import { physics, resetPhysics } from "./physicsTuning";
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
    rollLeft: false,
    rollRight: false,
    boosting: false,
    jump: false,
    ...overrides,
  };
}

function plant(p = createPlayer()) {
  p.vel.set(0, 0, 0);
  for (let i = 0; i < 180; i++) {
    stepPlayer(p, idleInput(), 1 / 60);
  }
  return p;
}

describe("ride-shell movement", () => {
  test("createPlayer spawns on a short drop-in above the ride shell", () => {
    const p = createPlayer();
    expect(signedAltitude(p.pos)).toBeGreaterThan(SOFT_BAND);
    expect(signedAltitude(p.pos)).toBeLessThan(SOFT_BAND + 3);
    expect(p.pos.length()).toBeGreaterThan(MOON_RADIUS + BOARD_CLEARANCE);
  });

  test("idle fall plants on the ride shell", () => {
    const p = plant();
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
    const p = plant();
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
    const p = plant();
    const yaw0 = p.yaw;
    for (let i = 0; i < 30; i++) {
      stepPlayer(p, idleInput({ left: true, forward: true }), 1 / 60);
    }
    expect(p.yaw).toBeGreaterThan(yaw0 + 0.2);
    expect(p.lean).toBeGreaterThan(0.5);
  });

  test("coasting without thrust slows down", () => {
    const p = plant();
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
    const p = plant();
    expect(p.grounded).toBe(true);
    stepPlayer(p, idleInput({ jump: true }), 1 / 60);
    expect(p.grounded).toBe(false);
    expect(p.vel.dot(p.contactNormal)).toBeGreaterThan(JUMP_SPEED * 0.8);
    for (let i = 0; i < 8; i++) {
      stepPlayer(p, idleInput(), 1 / 60);
    }
    expect(signedAltitude(p.pos)).toBeGreaterThan(SOFT_BAND);
  });

  test("landing after air sets landingPunch", () => {
    const p = plant();
    stepPlayer(p, idleInput({ jump: true }), 1 / 60);
    expect(p.grounded).toBe(false);
    let punched = false;
    for (let i = 0; i < 180; i++) {
      const wasAir = !p.grounded;
      stepPlayer(p, idleInput(), 1 / 60);
      if (wasAir && p.grounded) {
        expect(p.landingPunch).toBeGreaterThan(0.2);
        punched = true;
        break;
      }
    }
    expect(punched).toBe(true);
  });

  test("jump buffer fires after Space release when coyote returns", () => {
    const p = plant();
    // Hold clear of the shell so we don't re-plant mid-buffer.
    p.pos.addScaledVector(p.up, 6);
    p.vel.set(0, 0, 0);
    p.grounded = false;
    p.coyote = 0;
    p.airTime = 1;
    p.jumpBuffer = 0;
    p.jumpHeld = false;
    // Early Space while coyote-dead — queues buffer, no jump yet.
    stepPlayer(p, idleInput({ jump: true }), 1 / 60);
    expect(p.jumpBuffer).toBeGreaterThan(0);
    expect(p.grounded).toBe(false);
    const vBefore = p.vel.dot(p.contactNormal);
    // Restore coyote with Space released — buffer should still consume.
    p.coyote = physics.coyoteTime;
    p.jumpHeld = true;
    stepPlayer(p, idleInput({ jump: false }), 1 / 60);
    expect(p.vel.dot(p.contactNormal)).toBeGreaterThan(
      vBefore + JUMP_SPEED * 0.8,
    );
    expect(p.jumpBuffer).toBe(0);
  });

  test("boost raises the speed cap above maxSpeed", () => {
    const p = plant();
    const forward = new THREE.Vector3();
    const right = new THREE.Vector3();
    boardAxes(p.yaw, p.up, forward, right);
    // Seed past the unboosted cap; only boostMult should allow it.
    p.vel.copy(forward).multiplyScalar(physics.maxSpeed * 1.25);
    stepPlayer(p, idleInput({ forward: true, boosting: true }), 1 / 60);
    expect(p.vel.length()).toBeGreaterThan(physics.maxSpeed);
    expect(p.vel.length()).toBeLessThanOrEqual(
      physics.maxSpeed * physics.boostMult + 0.05,
    );

    p.vel.copy(forward).multiplyScalar(physics.maxSpeed * 1.25);
    stepPlayer(p, idleInput({ forward: true }), 1 / 60);
    expect(p.vel.length()).toBeLessThanOrEqual(physics.maxSpeed + 0.05);
  });

  test("getSpeedRatio uses boosted top speed as 1.0", () => {
    resetPhysics();
    expect(getSpeedRatio(physics.maxSpeed * physics.boostMult)).toBeCloseTo(
      1,
      5,
    );
    expect(getSpeedRatio(physics.maxSpeed)).toBeCloseTo(
      1 / physics.boostMult,
      5,
    );
  });

  test("air turn is snappier than ground turn", () => {
    const ground = plant();
    const air = plant();
    air.pos.addScaledVector(air.up, 10);
    air.vel.set(0, 0, 0);
    air.grounded = false;
    air.airTime = 1;
    ground.vel.set(0, 0, 0);
    ground.lean = 1;
    air.lean = 1;
    const g0 = ground.yaw;
    const a0 = air.yaw;
    for (let i = 0; i < 20; i++) {
      // Keep air clear of the shell so airTurnMult stays active.
      if (signedAltitude(air.pos) < 4) {
        air.pos.addScaledVector(air.up, 8);
        air.vel.set(0, 0, 0);
      }
      air.grounded = false;
      stepPlayer(ground, idleInput({ left: true }), 1 / 60);
      stepPlayer(air, idleInput({ left: true }), 1 / 60);
    }
    expect(air.yaw - a0).toBeGreaterThan((ground.yaw - g0) * 1.2);
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
