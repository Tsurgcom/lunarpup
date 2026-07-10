import { describe, expect, test } from "bun:test";
import * as THREE from "three";
import { MASS, gravityAccel } from "./physics";
import {
  PLAYER_RADIUS,
  ROCK_COUNT,
  createRock,
  resolveCollisions,
  rockMass,
  spawnRocks,
  stepRocks,
} from "./rockPhysics";
import {
  MOON_RADIUS,
  SPAWN_DIR,
  sampleNormalDir,
  surfacePoint,
} from "./terrain";

describe("lunar rock physics", () => {
  test("rock settles onto the crust under gravity", () => {
    const rock = createRock(SPAWN_DIR, 0.25);
    const dir = SPAWN_DIR.clone();
    rock.pos.copy(dir).multiplyScalar(MOON_RADIUS + 8);
    rock.vel.set(0, 0, 0);
    rock.grounded = false;

    const dt = 1 / 60;
    for (let i = 0; i < 240; i++) stepRocks([rock], dt);

    expect(rock.grounded).toBe(true);
    expect(rock.vel.length()).toBeLessThan(1.5);

    const n = new THREE.Vector3();
    sampleNormalDir(rock.pos.clone().normalize(), n);
    const surface = surfacePoint(rock.pos.clone().normalize(), 0);
    const height =
      (rock.pos.x - surface.x) * n.x +
      (rock.pos.y - surface.y) * n.y +
      (rock.pos.z - surface.z) * n.z;
    expect(height).toBeCloseTo(rock.radius, 1);
  });

  test("airborne rock falls toward the moon center", () => {
    const rock = createRock(SPAWN_DIR, 0.2);
    const dir = SPAWN_DIR.clone();
    const r0 = MOON_RADIUS + 35;
    rock.pos.copy(dir).multiplyScalar(r0);
    rock.vel.set(0, 0, 0);
    rock.grounded = false;

    const g0 = gravityAccel(r0);
    const dt = 1 / 60;
    for (let i = 0; i < 60; i++) stepRocks([rock], dt);

    const radialVel = rock.vel.dot(rock.pos.clone().normalize());
    expect(radialVel).toBeLessThan(-g0 * 0.85);
    expect(radialVel).toBeGreaterThan(-g0 * 1.35);
  });

  test("player–rock impulse conserves tangential momentum", () => {
    const rock = createRock(SPAWN_DIR, 0.22, "chunk");
    const east = new THREE.Vector3(0, 1, 0).cross(SPAWN_DIR).normalize();
    const n = new THREE.Vector3();
    sampleNormalDir(SPAWN_DIR, n);

    rock.pos.copy(surfacePoint(SPAWN_DIR, rock.radius));
    rock.vel.set(0, 0, 0);

    const playerPos = surfacePoint(SPAWN_DIR, 0.18).addScaledVector(
      east,
      -(PLAYER_RADIUS + rock.radius - 0.08),
    );
    const playerVel = east.clone().multiplyScalar(8);

    const pBefore =
      playerVel.dot(east) * MASS + rock.vel.dot(east) * rock.mass;

    resolveCollisions([rock], playerPos, playerVel);

    const pAfter =
      playerVel.dot(east) * MASS + rock.vel.dot(east) * rock.mass;

    expect(pAfter).toBeCloseTo(pBefore, 4);
    expect(rock.vel.dot(east)).toBeGreaterThan(1.5);
    expect(playerVel.dot(east)).toBeLessThan(8);

    const delta = rock.pos.clone().sub(playerPos);
    const dh = delta.dot(n);
    const ht = delta.clone().addScaledVector(n, -dh).length();
    const need = Math.sqrt(
      Math.max(0, (PLAYER_RADIUS + rock.radius) ** 2 - dh * dh),
    );
    expect(ht + 0.02).toBeGreaterThanOrEqual(need);
  });

  test("local pup separates from a remote peer", () => {
    const east = new THREE.Vector3(0, 1, 0).cross(SPAWN_DIR).normalize();
    const playerPos = surfacePoint(SPAWN_DIR, 0.18);
    const playerVel = new THREE.Vector3();
    const peerPos = playerPos.clone().addScaledVector(east, 0.4);

    resolveCollisions([], playerPos, playerVel, MASS, PLAYER_RADIUS, [
      { x: peerPos.x, y: peerPos.y, z: peerPos.z },
    ]);

    expect(playerPos.distanceTo(peerPos)).toBeGreaterThanOrEqual(
      PLAYER_RADIUS * 2 - 0.05,
    );
  });

  test("default spawn count is 20× the original field", () => {
    expect(ROCK_COUNT).toBe(800);
    expect(spawnRocks().length).toBe(800);
  });

  test("spawnRocks mixes kinds and keeps rocks small", () => {
    const rocks = spawnRocks(40);
    expect(rocks.length).toBe(40);

    const kinds = new Set(rocks.map((r) => r.kind));
    expect(kinds.size).toBeGreaterThanOrEqual(3);

    let sumR = 0;
    for (const rock of rocks) {
      expect(rock.radius).toBeGreaterThanOrEqual(0.07);
      expect(rock.radius).toBeLessThanOrEqual(0.45);
      sumR += rock.radius;
      expect(rock.pos.length()).toBeGreaterThan(MOON_RADIUS * 0.9);
    }
    expect(sumR / rocks.length).toBeLessThan(0.28);
  });

  test("rockMass scales with densityScale", () => {
    const base = rockMass(0.2);
    const light = rockMass(0.2, 0.85);
    expect(light).toBeCloseTo(base * 0.85, 8);
  });
});
