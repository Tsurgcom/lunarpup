import { describe, expect, test } from "bun:test";
import * as THREE from "three";
import {
  AIR_DRAG,
  G,
  GRAVITY_SOFT,
  MASS,
  MU,
  MU_ROLL,
  atmosphereDensity,
  boardAxes,
  circularOrbitSpeed,
  createBody,
  escapeSpeed,
  gravityAccel,
  stepBody,
  type ControlInput,
} from "./physics";
import {
  MOON_RADIUS,
  SPAWN_DIR,
  sampleHeightDir,
  sampleNormalDir,
} from "./terrain";

const idle: ControlInput = {
  forward: false,
  back: false,
  left: false,
  right: false,
  pitchUp: false,
  pitchDown: false,
  jump: false,
  jetpack: false,
};

describe("newtonian physics on a sphere", () => {
  test("gravity is softened inverse-square from the moon center", () => {
    expect(gravityAccel(MOON_RADIUS)).toBeCloseTo(G, 8);
    // Far away still falls off, but gentler than pure 1/r² near the crust.
    const gFar = gravityAccel(2 * MOON_RADIUS);
    expect(gFar).toBeLessThan(G);
    expect(gFar).toBeGreaterThan(G / 4);
    expect(MU).toBeCloseTo(
      G * (MOON_RADIUS + GRAVITY_SOFT) * (MOON_RADIUS + GRAVITY_SOFT),
      6,
    );

    // Crater-scale Δr must not swing g as hard as pure 1/r².
    const floorR = MOON_RADIUS - 7;
    const rimR = MOON_RADIUS + 1;
    const softRatio = gravityAccel(floorR) / gravityAccel(rimR);
    const hardRatio =
      (rimR * rimR) / (floorR * floorR);
    expect(softRatio).toBeLessThan(hardRatio);
    expect(softRatio).toBeLessThan(1.04);
  });

  test("free fall accelerates at local g(r)", () => {
    const body = createBody();
    const dir = body.pos.clone().normalize();
    const r0 = MOON_RADIUS + 40;
    body.pos.copy(dir).multiplyScalar(r0);
    body.vel.set(0, 0, 0);
    body.grounded = false;
    body.normalForce = 0;

    const g0 = gravityAccel(r0);
    const dt = 1 / 60;
    for (let i = 0; i < 60; i++) stepBody(body, idle, dt);

    const radialVel = body.vel.dot(body.pos.clone().normalize());
    // After 1s of fall, speed ≈ g0 (r drops a bit so slightly more).
    expect(radialVel).toBeLessThan(-g0 * 0.85);
    expect(radialVel).toBeGreaterThan(-g0 * 1.35);
  });

  test("push force increases speed along the board", () => {
    const body = createBody();
    body.vel.set(0, 0, 0);

    const input = { ...idle, forward: true };
    const before = body.vel.length();
    stepBody(body, input, 1 / 60);
    expect(body.vel.length()).toBeGreaterThan(before);
  });

  test("air drag opposes velocity (F = -c|v|v)", () => {
    const v = new THREE.Vector3(10, 0, 0);
    const f = v.clone().multiplyScalar(-AIR_DRAG * v.length());
    expect(f.x).toBeLessThan(0);
    expect(f.length()).toBeCloseTo(AIR_DRAG * 100, 5);
  });

  test("atmosphere thins with altitude", () => {
    expect(atmosphereDensity(MOON_RADIUS)).toBeCloseTo(1, 5);
    expect(atmosphereDensity(MOON_RADIUS + 160)).toBeLessThan(0.01);
  });

  test("resting on the crust does not sink", () => {
    const body = createBody();
    body.vel.set(0, 0, 0);
    for (let i = 0; i < 120; i++) stepBody(body, idle, 1 / 60);
    expect(body.grounded).toBe(true);
    const radialVel = body.vel.dot(body.pos.clone().normalize());
    expect(radialVel).toBeGreaterThan(-0.5);
    expect(body.vel.length()).toBeLessThan(3);
  });

  test("fast ballistic path does not stick into a crevice", () => {
    const body = createBody();
    const east = new THREE.Vector3(0, 1, 0).cross(SPAWN_DIR).normalize();
    // Start on the rim, fire across the spawn bowl at near-orbital speed.
    const rimDir = SPAWN_DIR.clone()
      .applyAxisAngle(east, 16 / MOON_RADIUS)
      .normalize();
    const h = sampleHeightDir(rimDir);
    const r = MOON_RADIUS + h + 0.18;
    body.pos.copy(rimDir).multiplyScalar(r);
    sampleNormalDir(rimDir, body.normal);
    body.grounded = true;

    const across = SPAWN_DIR.clone()
      .addScaledVector(rimDir, -SPAWN_DIR.dot(rimDir))
      .normalize();
    body.vel.copy(across).multiplyScalar(circularOrbitSpeed(r) * 0.95);

    let minHeight = Infinity;
    let wasAirborne = false;
    for (let i = 0; i < 180; i++) {
      stepBody(body, idle, 1 / 60);
      if (!body.grounded) wasAirborne = true;
      minHeight = Math.min(minHeight, body.pos.length() - MOON_RADIUS);
    }
    // Should loft over the bowl floor rather than vacuuming down to it.
    expect(wasAirborne).toBe(true);
    const floorH = sampleHeightDir(SPAWN_DIR);
    expect(minHeight).toBeGreaterThan(floorH + 1.5);
  });

  test("circular orbit holds altitude above the atmosphere", () => {
    const body = createBody();
    const dir = SPAWN_DIR.clone();
    const r = MOON_RADIUS + 110;
    body.pos.copy(dir).multiplyScalar(r);
    const east = new THREE.Vector3(0, 1, 0).cross(dir).normalize();
    body.vel.copy(east).multiplyScalar(circularOrbitSpeed(r));
    body.grounded = false;
    body.normalForce = 0;
    sampleNormalDir(dir, body.normal);

    const r0 = body.pos.length();
    for (let i = 0; i < 600; i++) stepBody(body, idle, 1 / 60);
    const r1 = body.pos.length();
    expect(Math.abs(r1 - r0)).toBeLessThan(16);
    expect(body.grounded).toBe(false);
    expect(escapeSpeed(r)).toBeGreaterThan(circularOrbitSpeed(r));
  });

  test("ollie applies outward impulse", () => {
    const body = createBody();
    const east = new THREE.Vector3(0, 1, 0).cross(body.pos).normalize();
    body.vel.copy(east).multiplyScalar(4);
    for (let i = 0; i < 5; i++) stepBody(body, idle, 1 / 60);
    expect(body.grounded).toBe(true);
    const radialBefore = body.vel.dot(body.normal);
    stepBody(body, { ...idle, jump: true }, 1 / 60);
    expect(body.grounded).toBe(false);
    expect(body.vel.dot(body.normal)).toBeGreaterThan(radialBefore + 0.5);
  });

  test("jetpack thrusts along board forward", () => {
    const body = createBody();
    body.pos.addScaledVector(body.pos.clone().normalize(), 8);
    body.vel.set(0, 0, 0);
    body.grounded = false;
    body.normalForce = 0;
    boardAxes(body.yaw, body.normal, new THREE.Vector3(), new THREE.Vector3());
    const fwd = new THREE.Vector3();
    const right = new THREE.Vector3();
    // after step, velocity should align with forward
    stepBody(body, { ...idle, jetpack: true, forward: true }, 1 / 60);
    boardAxes(body.yaw, body.normal, fwd, right);
    expect(body.vel.dot(fwd)).toBeGreaterThan(0.05);
  });

  test("jetpack reverse thrusts backward", () => {
    const body = createBody();
    body.pos.addScaledVector(body.pos.clone().normalize(), 8);
    body.vel.set(0, 0, 0);
    body.grounded = false;
    body.normalForce = 0;
    stepBody(body, { ...idle, jetpack: true, back: true }, 1 / 60);
    const fwd = new THREE.Vector3();
    const right = new THREE.Vector3();
    boardAxes(body.yaw, body.normal, fwd, right);
    expect(body.vel.dot(fwd)).toBeLessThan(-0.05);
  });

  test("wheel push does nothing high above the crust", () => {
    const body = createBody();
    body.pos.addScaledVector(body.pos.clone().normalize(), 25);
    body.vel.set(0, 0, 0);
    body.grounded = false;
    body.normalForce = 0;
    const before = body.vel.clone();
    stepBody(body, { ...idle, forward: true }, 1 / 60);
    // Gravity still acts; wheel push must not add tangential burn.
    const fwd = new THREE.Vector3();
    const right = new THREE.Vector3();
    boardAxes(body.yaw, body.normal, fwd, right);
    const tangGain = body.vel.dot(fwd) - before.dot(fwd);
    expect(Math.abs(tangGain)).toBeLessThan(0.05);
  });

  test("grounded board normal follows surface, not moon radial", () => {
    const body = createBody();
    const east = new THREE.Vector3(0, 1, 0).cross(SPAWN_DIR).normalize();
    const wallDir = SPAWN_DIR.clone()
      .applyAxisAngle(east, 10 / MOON_RADIUS)
      .normalize();
    const h = sampleHeightDir(wallDir);
    sampleNormalDir(wallDir, body.normal);
    body.pos
      .copy(wallDir)
      .multiplyScalar(MOON_RADIUS + h)
      .addScaledVector(body.normal, 0.18);
    body.vel.set(0, 0, 0);
    body.grounded = true;

    for (let i = 0; i < 30; i++) stepBody(body, idle, 1 / 60);

    const radial = body.pos.clone().normalize();
    const surfaceN = sampleNormalDir(radial, new THREE.Vector3());
    expect(body.normal.dot(surfaceN)).toBeGreaterThan(0.98);
    // Must not have collapsed onto the CoM radial on a crater wall.
    expect(body.normal.dot(radial)).toBeLessThan(0.98);
  });

  test("resting on a crater wall does not drain into the bowl", () => {
    const body = createBody();
    const east = new THREE.Vector3(0, 1, 0).cross(SPAWN_DIR).normalize();
    const wallDir = SPAWN_DIR.clone()
      .applyAxisAngle(east, 10 / MOON_RADIUS)
      .normalize();
    const h = sampleHeightDir(wallDir);
    sampleNormalDir(wallDir, body.normal);
    body.pos
      .copy(wallDir)
      .multiplyScalar(MOON_RADIUS + h)
      .addScaledVector(body.normal, 0.18);
    body.vel.set(0, 0, 0);
    body.grounded = true;

    const startDist =
      body.pos.clone().normalize().angleTo(SPAWN_DIR) * MOON_RADIUS;
    for (let i = 0; i < 180; i++) stepBody(body, idle, 1 / 60);
    const endDist =
      body.pos.clone().normalize().angleTo(SPAWN_DIR) * MOON_RADIUS;

    expect(body.grounded).toBe(true);
    // Tangential gravity used to vacuum into the floor; stay put instead.
    expect(Math.abs(endDist - startDist)).toBeLessThan(1.5);
    expect(body.vel.length()).toBeLessThan(2);
  });

  test("airborne attitude stays inertial over terrain", () => {
    const body = createBody();
    const east = new THREE.Vector3(0, 1, 0).cross(SPAWN_DIR).normalize();
    const wallDir = SPAWN_DIR.clone()
      .applyAxisAngle(east, 10 / MOON_RADIUS)
      .normalize();
    sampleNormalDir(wallDir, body.normal);
    const held = body.normal.clone();

    // Launch across the spawn bowl while airborne.
    body.pos.copy(wallDir).multiplyScalar(MOON_RADIUS + 6);
    body.vel
      .copy(SPAWN_DIR)
      .addScaledVector(wallDir, -SPAWN_DIR.dot(wallDir))
      .normalize()
      .multiplyScalar(12);
    body.grounded = false;
    body.normalForce = 0;

    for (let i = 0; i < 45; i++) stepBody(body, idle, 1 / 60);

    expect(body.grounded).toBe(false);
    expect(body.normal.dot(held)).toBeGreaterThan(0.995);
  });

  test("mass and g define weight", () => {
    expect(MASS * G).toBeGreaterThan(0);
    expect(MU_ROLL).toBeGreaterThan(0);
    expect(MU_ROLL).toBeLessThan(1);
  });

  test("lean eases in and recovers instead of snapping", () => {
    const body = createBody();
    body.vel.set(0, 0, 0);

    stepBody(body, { ...idle, left: true }, 1 / 60);
    expect(body.lean).toBeGreaterThan(0);
    expect(body.lean).toBeLessThan(0.35);

    for (let i = 0; i < 90; i++) {
      stepBody(body, { ...idle, left: true }, 1 / 60);
    }
    expect(body.lean).toBeGreaterThan(0.9);

    const held = body.lean;
    stepBody(body, idle, 1 / 60);
    expect(body.lean).toBeLessThan(held);
    expect(body.lean).toBeGreaterThan(held * 0.85);
  });

  test("lean left increases yaw (turn into the lean)", () => {
    const body = createBody();
    body.vel.set(0, 0, 0);
    body.lean = 1;
    const yaw0 = body.yaw;
    stepBody(body, { ...idle, left: true }, 1 / 60);
    expect(body.yaw).toBeGreaterThan(yaw0);
  });

  test("grounded steer is weaker at high speed", () => {
    const slow = createBody();
    const fast = createBody();
    slow.lean = 1;
    fast.lean = 1;
    slow.vel.set(0, 0, 0);
    const fwd = new THREE.Vector3();
    const right = new THREE.Vector3();
    boardAxes(fast.yaw, fast.normal, fwd, right);
    fast.vel.copy(fwd).multiplyScalar(24);

    const yawSlow0 = slow.yaw;
    const yawFast0 = fast.yaw;
    stepBody(slow, { ...idle, left: true }, 1 / 60);
    stepBody(fast, { ...idle, left: true }, 1 / 60);

    const dSlow = slow.yaw - yawSlow0;
    const dFast = fast.yaw - yawFast0;
    expect(dSlow).toBeGreaterThan(0);
    expect(dFast).toBeGreaterThan(0);
    expect(dFast).toBeLessThan(dSlow * 0.55);
  });

  test("switching A to D crosses lean smoothly", () => {
    const body = createBody();
    body.vel.set(0, 0, 0);
    for (let i = 0; i < 60; i++) {
      stepBody(body, { ...idle, left: true }, 1 / 60);
    }
    expect(body.lean).toBeGreaterThan(0.85);

    const samples: number[] = [];
    for (let i = 0; i < 45; i++) {
      stepBody(body, { ...idle, right: true }, 1 / 60);
      samples.push(body.lean);
    }
    // Monotonic slide from left lean toward right — no snap to zero.
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]!).toBeLessThanOrEqual(samples[i - 1]! + 1e-6);
    }
    expect(samples[0]!).toBeGreaterThan(0.5);
    expect(body.lean).toBeLessThan(0);
  });

  test("pitch eases in on R and recovers on release", () => {
    const body = createBody();
    body.vel.set(0, 0, 0);

    stepBody(body, { ...idle, pitchUp: true }, 1 / 60);
    expect(body.pitch).toBeGreaterThan(0);
    expect(body.pitch).toBeLessThan(0.35);

    for (let i = 0; i < 90; i++) {
      stepBody(body, { ...idle, pitchUp: true }, 1 / 60);
    }
    expect(body.pitch).toBeGreaterThan(0.9);

    const held = body.pitch;
    stepBody(body, idle, 1 / 60);
    expect(body.pitch).toBeLessThan(held);
    expect(body.pitch).toBeGreaterThan(held * 0.85);
  });

  test("airborne R pitches nose up (normal tips aft)", () => {
    const body = createBody();
    body.pos.addScaledVector(body.pos.clone().normalize(), 8);
    body.vel.set(0, 0, 0);
    body.grounded = false;
    body.normalForce = 0;
    body.pitch = 1;

    const fwd = new THREE.Vector3();
    const right = new THREE.Vector3();
    boardAxes(body.yaw, body.normal, fwd, right);
    const n0 = body.normal.clone();

    stepBody(body, { ...idle, pitchUp: true }, 1 / 60);

    // Nose up: deck normal tips toward −forward.
    expect(body.normal.dot(fwd)).toBeLessThan(n0.dot(fwd) - 0.01);
  });
});
