import { describe, expect, test } from "bun:test";
import * as THREE from "three";
import { MOON_RADIUS } from "./moon";
import { physics, resetPhysics } from "./physicsTuning";
import {
  antiTunnel,
  applyRideShellField,
  BOARD_CLEARANCE,
  contactRegime,
  createShellSample,
  G_LUNAR,
  JUMP_SPEED,
  MAX_PENETRATION,
  plantOnShell,
  rideRadius,
  SOFT_BAND,
  sampleRideShell,
  sampleShellNormal,
  signedAltitude,
  tryJump,
  updateContactState,
} from "./rideShell";

describe("rideShell", () => {
  test("flat-sphere normal ≈ radial", () => {
    const dir = new THREE.Vector3(0.2, 0.5, 0.8).normalize();
    const n = sampleShellNormal(dir);
    expect(n.dot(dir)).toBeGreaterThan(0.999);
  });

  test("heightfield floor normal stays near-radial", async () => {
    const { setTerrainGenerator } = await import("./chunkLod");
    const { lunarSurface } = await import("./lunarTerrain");
    const { SPAWN_DIR } = await import("./moon");
    setTerrainGenerator(lunarSurface);
    const n = sampleShellNormal(SPAWN_DIR);
    expect(n.dot(SPAWN_DIR)).toBeGreaterThan(0.98);
    setTerrainGenerator(null);
  });

  test("ride radius includes clearance", () => {
    const dir = new THREE.Vector3(0, 0, 1);
    expect(rideRadius(dir)).toBeCloseTo(MOON_RADIUS + BOARD_CLEARANCE, 5);
  });

  test("signed altitude is positive above the shell", () => {
    const pos = new THREE.Vector3(0, 0, MOON_RADIUS + BOARD_CLEARANCE + 3);
    expect(signedAltitude(pos)).toBeCloseTo(3, 5);
    expect(contactRegime(signedAltitude(pos))).toBe("airborne");
  });

  test("gravity pulls toward the shell", () => {
    const shell = createShellSample();
    const pos = new THREE.Vector3(0, 0, MOON_RADIUS + BOARD_CLEARANCE + 8);
    const vel = new THREE.Vector3(0, 0, 0);
    const mass = 18;
    applyRideShellField(pos, vel, mass, 1 / 60, shell);
    // Inward (toward moon center) ⇒ negative radial velocity along +Z.
    expect(vel.z).toBeLessThan(0);
    expect(Math.abs(vel.z)).toBeCloseTo(G_LUNAR / 60, 3);
  });

  test("anti-tunnel projects out of deep penetration", () => {
    const shell = createShellSample();
    const pos = new THREE.Vector3(
      0,
      0,
      MOON_RADIUS + BOARD_CLEARANCE - MAX_PENETRATION - 1,
    );
    const vel = new THREE.Vector3(0, 0, -20);
    antiTunnel(pos, vel, shell);
    expect(signedAltitude(pos)).toBeGreaterThanOrEqual(-MAX_PENETRATION - 1e-6);
    expect(vel.z).toBeGreaterThanOrEqual(-1e-6);
  });

  test("plantOnShell sits on the ride shell", () => {
    const p = plantOnShell(new THREE.Vector3(0, 0.2, 1));
    expect(Math.abs(signedAltitude(p))).toBeLessThan(1e-5);
  });

  test("sampleRideShell reports soft / planted regimes", () => {
    const shell = createShellSample();
    const softPos = new THREE.Vector3(
      0,
      0,
      MOON_RADIUS + BOARD_CLEARANCE + SOFT_BAND * 0.5,
    );
    sampleRideShell(softPos, shell);
    expect(contactRegime(shell.altitude)).toBe("soft");

    const plantPos = new THREE.Vector3(
      0,
      0,
      MOON_RADIUS + BOARD_CLEARANCE - 0.05,
    );
    sampleRideShell(plantPos, shell);
    expect(contactRegime(shell.altitude)).toBe("planted");
  });

  test("tryJump applies impulse when grounded", () => {
    const vel = new THREE.Vector3(5, 0, 0);
    const n = new THREE.Vector3(0, 0, 1);
    const result = tryJump(vel, n, true, 0, true);
    expect(result.jumped).toBe(true);
    expect(result.grounded).toBe(false);
    expect(vel.z).toBeGreaterThanOrEqual(JUMP_SPEED - 1e-6);
  });

  test("tryJump uses coyote when airborne", () => {
    const vel = new THREE.Vector3(0, 0, 0);
    const n = new THREE.Vector3(0, 0, 1);
    expect(tryJump(vel, n, false, 0, true).jumped).toBe(false);
    expect(tryJump(vel, n, false, 0.1, true).jumped).toBe(true);
  });

  test("landing catch rejects outward loft past the gate", () => {
    resetPhysics();
    const shell = createShellSample();
    const pos = new THREE.Vector3(0, 0, MOON_RADIUS + BOARD_CLEARANCE - 0.02);
    sampleRideShell(pos, shell);
    const rising = new THREE.Vector3(0, 0, physics.landingCatchSpeed + 0.2);
    const miss = updateContactState(false, 0.2, 0, shell, rising, 1 / 60);
    expect(miss.grounded).toBe(false);

    const settling = new THREE.Vector3(0, 0, -0.1);
    const hit = updateContactState(false, 0.2, 0, shell, settling, 1 / 60);
    expect(hit.grounded).toBe(true);
  });
});
