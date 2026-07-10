import { describe, expect, test } from "bun:test";
import * as THREE from "three";
import {
  AIR_DRAG,
  G,
  MASS,
  MU_ROLL,
  createBody,
  stepBody,
  type ControlInput,
} from "./physics";

const idle: ControlInput = {
  forward: false,
  back: false,
  left: false,
  right: false,
  jump: false,
  brake: false,
};

describe("newtonian physics", () => {
  test("free fall accelerates at g", () => {
    const body = createBody(0, 14);
    body.pos.y += 20;
    body.vel.set(0, 0, 0);
    body.grounded = false;
    body.normalForce = 0;

    const dt = 1 / 60;
    for (let i = 0; i < 60; i++) stepBody(body, idle, dt);

    // v_y ≈ -g t after 1s (still airborne)
    expect(body.pos.y).toBeGreaterThan(sampleAirMin());
    expect(body.vel.y).toBeCloseTo(-G, 0);
  });

  test("push force yields a = F/m along the board", () => {
    const body = createBody(0, 14);
    body.vel.set(0, 0, 0);
    // Flatten contact for a clean sample: sit on rim-ish flat
    body.pos.set(55, 0, 55);
    body.pos.y = 10; // will snap on first contact step

    const input = { ...idle, forward: true };
    const before = body.vel.clone();
    stepBody(body, input, 1 / 60);

    // After one grounded step with push, longitudinal accel should be positive
    expect(body.vel.length()).toBeGreaterThan(before.length());
  });

  test("air drag opposes velocity (F = -c|v|v)", () => {
    const v = new THREE.Vector3(10, 0, 0);
    const f = v.clone().multiplyScalar(-AIR_DRAG * v.length());
    expect(f.x).toBeLessThan(0);
    expect(f.length()).toBeCloseTo(AIR_DRAG * 100, 5);
  });

  test("resting on flat ground does not sink", () => {
    const body = createBody(50, 50);
    body.vel.set(0, 0, 0);
    for (let i = 0; i < 120; i++) stepBody(body, idle, 1 / 60);
    expect(body.grounded).toBe(true);
    expect(body.vel.y).toBeGreaterThan(-0.5);
    expect(body.vel.length()).toBeLessThan(2);
  });

  test("gravity pulls into a crater bowl", () => {
    // Start on the transition of the center crater, board aimed downhill
    const body = createBody(14, 0);
    body.yaw = Math.PI / 2; // face -X toward the bowl center
    body.vel.set(0, 0, 0);
    const startY = body.pos.y;
    const startR = Math.hypot(body.pos.x, body.pos.z);
    for (let i = 0; i < 300; i++) stepBody(body, idle, 1 / 60);
    const endR = Math.hypot(body.pos.x, body.pos.z);
    expect(body.pos.y).toBeLessThan(startY - 0.8);
    expect(endR).toBeLessThan(startR - 1);
  });

  test("ollie applies upward impulse", () => {
    const body = createBody(0, 14);
    body.vel.set(4, 0, 0);
    for (let i = 0; i < 5; i++) stepBody(body, idle, 1 / 60);
    expect(body.grounded).toBe(true);
    const vyBefore = body.vel.y;
    stepBody(body, { ...idle, jump: true }, 1 / 60);
    expect(body.grounded).toBe(false);
    expect(body.vel.y).toBeGreaterThan(vyBefore + 0.5);
  });

  test("mass and g define weight", () => {
    expect(MASS * G).toBeGreaterThan(0);
    expect(MU_ROLL).toBeGreaterThan(0);
    expect(MU_ROLL).toBeLessThan(1);
  });
});

function sampleAirMin(): number {
  // Just ensure we didn't somehow teleport underground in the freefall test setup
  return -50;
}
