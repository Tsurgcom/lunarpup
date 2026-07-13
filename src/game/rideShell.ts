import * as THREE from "three";
import { sampleTerrainHeight } from "./chunkLod";
import { MOON_RADIUS } from "./moon";

/** Board height above the terrain shell when planted (m). */
export const BOARD_CLEARANCE = 0.85;

/** Soft pre-load band above the shell (m). */
export const SOFT_BAND = 0.55;

/** Stylized lunar gravity magnitude (m/s²). */
export const G_LUNAR = 3.2;

/** Compression spring stiffness (N/m) — stiff plant. */
export const COMPRESS_STIFFNESS = 4200;

/** Soft-band spring stiffness (N/m) — light preload. */
export const SOFT_STIFFNESS = 180;

/** Normal damper (N·s/m). */
export const NORMAL_DAMPING = 220;

/** Hard floor: project out if penetration exceeds this (m). */
export const MAX_PENETRATION = 0.35;

/** Leave plant when outward and above this altitude (m). */
export const LEAVE_EPSILON = 0.04;

/** Jump impulse along contact normal (m/s). */
export const JUMP_SPEED = 7.5;

/** Coyote window after leaving plant (s). */
export const COYOTE_TIME = 0.12;

/** Finite-difference arc for shell normal (radians). */
const NORMAL_EPS = 1.2e-3;

const _dir = new THREE.Vector3();
const _east = new THREE.Vector3();
const _north = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _force = new THREE.Vector3();

export type RideShellSample = {
  /** Unit radial direction of the query. */
  dir: THREE.Vector3;
  /** World-space ride radius including clearance. */
  radius: number;
  /** Outward surface normal (≈ dir on a flat sphere). */
  normal: THREE.Vector3;
  /** Signed altitude above the ride shell (m). */
  altitude: number;
};

export type ContactRegime = "airborne" | "soft" | "planted";

/** Terrain radius (no clearance) along a unit direction. */
export function terrainRadius(dir: THREE.Vector3): number {
  return MOON_RADIUS + sampleTerrainHeight(dir);
}

/** Ride-shell radius (terrain + board clearance) along a unit direction. */
export function rideRadius(dir: THREE.Vector3): number {
  return terrainRadius(dir) + BOARD_CLEARANCE;
}

/**
 * East/north tangent basis for a unit radial direction
 * (same compass frame as boardAxes).
 */
export function shellTangentBasis(
  dir: THREE.Vector3,
  east: THREE.Vector3,
  north: THREE.Vector3,
): void {
  east.set(0, 1, 0).cross(dir);
  if (east.lengthSq() < 1e-8) {
    east.set(1, 0, 0).cross(dir);
  }
  east.normalize();
  north.crossVectors(dir, east).normalize();
}

/**
 * Finite-difference surface normal of the ride shell.
 * On a flat sphere (height 0) this collapses to `dir`.
 */
export function sampleShellNormal(
  dir: THREE.Vector3,
  out = new THREE.Vector3(),
): THREE.Vector3 {
  shellTangentBasis(dir, _east, _north);

  // Sample shell radius at ±eps along east and north (exp-map on the sphere).
  const r0 = rideRadius(dir);

  _tmp.copy(dir).addScaledVector(_east, NORMAL_EPS).normalize();
  const rE = rideRadius(_tmp);
  _tmp.copy(dir).addScaledVector(_north, NORMAL_EPS).normalize();
  const rN = rideRadius(_tmp);

  // Gradient of R in the tangent plane → outward normal ≈ dir − ∇_tang R.
  const dRdE = (rE - r0) / NORMAL_EPS;
  const dRdN = (rN - r0) / NORMAL_EPS;
  out.copy(dir).addScaledVector(_east, -dRdE).addScaledVector(_north, -dRdN);
  return out.normalize();
}

/**
 * Sample the ride shell at a world position.
 * Writes into `out` (reuses its vector fields).
 */
export function sampleRideShell(
  pos: THREE.Vector3,
  out: RideShellSample,
): RideShellSample {
  const len = pos.length();
  if (len < 1e-8) {
    out.dir.set(0, 0, 1);
  } else {
    out.dir.copy(pos).multiplyScalar(1 / len);
  }
  out.radius = rideRadius(out.dir);
  sampleShellNormal(out.dir, out.normal);
  out.altitude = len - out.radius;
  return out;
}

/** Signed altitude above the ride shell at `pos`. */
export function signedAltitude(pos: THREE.Vector3): number {
  const len = pos.length();
  if (len < 1e-8) return -rideRadius(_dir.set(0, 0, 1));
  _dir.copy(pos).multiplyScalar(1 / len);
  return len - rideRadius(_dir);
}

export function contactRegime(altitude: number): ContactRegime {
  if (altitude > SOFT_BAND) return "airborne";
  if (altitude > 0) return "soft";
  return "planted";
}

/**
 * Radial field + contact support along the surface normal.
 * Support never acts in the tangent plane (skate feel).
 *
 * Returns the contact regime after evaluating altitude.
 */
export function applyRideShellField(
  pos: THREE.Vector3,
  vel: THREE.Vector3,
  mass: number,
  dt: number,
  shell: RideShellSample,
): ContactRegime {
  sampleRideShell(pos, shell);
  const h = shell.altitude;
  const n = shell.normal;
  const regime = contactRegime(h);

  _force.set(0, 0, 0);

  // Always pull toward the shell (lunar gravity along −normal ≈ −radial).
  _force.addScaledVector(n, -G_LUNAR * mass);

  const vN = vel.dot(n);

  if (regime === "soft") {
    // Weak preload spring only while approaching / settling in the band.
    const softH = SOFT_BAND - h;
    _force.addScaledVector(n, SOFT_STIFFNESS * softH);
    if (vN < 0) {
      _force.addScaledVector(n, -NORMAL_DAMPING * 0.35 * vN);
    }
  } else if (regime === "planted") {
    // Stiff compression: h ≤ 0 means penetrating below the ride shell.
    _force.addScaledVector(n, -COMPRESS_STIFFNESS * h);
    _force.addScaledVector(n, -NORMAL_DAMPING * vN);
  }

  vel.addScaledVector(_force, dt / mass);
  return regime;
}

/**
 * Project out of deep penetration and kill inward normal velocity.
 * Call after position integration.
 */
export function antiTunnel(
  pos: THREE.Vector3,
  vel: THREE.Vector3,
  shell: RideShellSample,
): void {
  sampleRideShell(pos, shell);
  if (shell.altitude >= -MAX_PENETRATION) return;

  pos.copy(shell.dir).multiplyScalar(shell.radius);
  const vN = vel.dot(shell.normal);
  if (vN < 0) {
    vel.addScaledVector(shell.normal, -vN);
  }
}

/** Place a point on the ride shell along `dir` (unit or not). */
export function plantOnShell(
  dir: THREE.Vector3,
  out = new THREE.Vector3(),
): THREE.Vector3 {
  _dir.copy(dir);
  if (_dir.lengthSq() < 1e-8) _dir.set(0, 0, 1);
  else _dir.normalize();
  return out.copy(_dir).multiplyScalar(rideRadius(_dir));
}

/**
 * Update grounded / coyote / airTime from the post-step shell sample.
 * Jump is resolved separately by the caller.
 */
export function updateContactState(
  grounded: boolean,
  airTime: number,
  coyote: number,
  shell: RideShellSample,
  vel: THREE.Vector3,
  dt: number,
): { grounded: boolean; airTime: number; coyote: number } {
  const h = shell.altitude;
  const vN = vel.dot(shell.normal);
  const regime = contactRegime(h);

  let nextGrounded = grounded;
  let nextAir = airTime;
  let nextCoyote = coyote;

  if (
    regime === "planted" ||
    (regime === "soft" && vN <= 0.15 && h < SOFT_BAND * 0.5)
  ) {
    // Plant when compressing into/near the shell.
    if (vN <= LEAVE_EPSILON * 20 || h <= 0) {
      nextGrounded = true;
      nextAir = 0;
      nextCoyote = COYOTE_TIME;
    }
  }

  if (nextGrounded) {
    // Leave if rising clear of the shell.
    if (vN > 0.4 && h > LEAVE_EPSILON) {
      nextGrounded = false;
      nextAir = 0;
      nextCoyote = COYOTE_TIME;
    } else if (h > SOFT_BAND) {
      nextGrounded = false;
      nextAir = 0;
      nextCoyote = COYOTE_TIME;
    } else {
      nextAir = 0;
      nextCoyote = COYOTE_TIME;
    }
  } else {
    nextAir += dt;
    nextCoyote = Math.max(0, nextCoyote - dt);
  }

  return { grounded: nextGrounded, airTime: nextAir, coyote: nextCoyote };
}

/** Apply a jump impulse along the contact normal if allowed. */
export function tryJump(
  vel: THREE.Vector3,
  normal: THREE.Vector3,
  grounded: boolean,
  coyote: number,
  jumpPressed: boolean,
): { jumped: boolean; grounded: boolean; coyote: number } {
  if (!jumpPressed) {
    return { jumped: false, grounded, coyote };
  }
  if (!grounded && coyote <= 0) {
    return { jumped: false, grounded, coyote };
  }
  const vN = vel.dot(normal);
  if (vN < JUMP_SPEED) {
    vel.addScaledVector(normal, JUMP_SPEED - Math.max(0, vN));
  }
  return { jumped: true, grounded: false, coyote: 0 };
}

/** Allocate a reusable shell sample (for hot loops). */
export function createShellSample(): RideShellSample {
  return {
    dir: new THREE.Vector3(0, 0, 1),
    radius: MOON_RADIUS + BOARD_CLEARANCE,
    normal: new THREE.Vector3(0, 0, 1),
    altitude: 0,
  };
}
