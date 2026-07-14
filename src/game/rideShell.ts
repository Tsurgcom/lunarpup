import * as THREE from "three";
import { sampleTerrainHeight } from "./chunkLod";
import { MOON_RADIUS } from "./moon";
import { DEFAULT_PHYSICS, physics } from "./physicsTuning";

/**
 * Board origin height above the terrain shell when planted (m).
 * SkateDog wheels sit ~0.05 below the group origin — keep this small so the
 * deck isn't a hoverboard, with a little slack for clipmap chord error.
 * Live value: {@link physics}.boardClearance (`?tweaking`).
 */
export const BOARD_CLEARANCE = DEFAULT_PHYSICS.boardClearance;

/** Soft pre-load band above the shell (m). Live: {@link physics}.softBand. */
export const SOFT_BAND = DEFAULT_PHYSICS.softBand;

/** Stylized lunar gravity magnitude (m/s²). Live: {@link physics}.gLunar. */
export const G_LUNAR = DEFAULT_PHYSICS.gLunar;

/**
 * Compression spring stiffness (N/m).
 * Firm enough to hold bowl walls at skate speed (centripetal), without buzz.
 * Live: {@link physics}.compressStiffness.
 */
export const COMPRESS_STIFFNESS = DEFAULT_PHYSICS.compressStiffness;

/**
 * Soft-band spring stiffness (N/m).
 * Must stay below weight/SOFT_BAND so gravity can pull the board into plant
 * (otherwise it hovers forever in the preload cushion).
 * Live: {@link physics}.softStiffness.
 */
export const SOFT_STIFFNESS = DEFAULT_PHYSICS.softStiffness;

/** Normal damper (N·s/m). Live: {@link physics}.normalDamping. */
export const NORMAL_DAMPING = DEFAULT_PHYSICS.normalDamping;

/** Hard floor: project out if penetration exceeds this (m). Live: {@link physics}.maxPenetration. */
export const MAX_PENETRATION = DEFAULT_PHYSICS.maxPenetration;

/** Leave plant when outward and above this altitude (m). */
export const LEAVE_EPSILON = 0.05;

/** Jump impulse along contact normal (m/s). Live: {@link physics}.jumpSpeed. */
export const JUMP_SPEED = DEFAULT_PHYSICS.jumpSpeed;

/** Coyote window after leaving plant (s). Live: {@link physics}.coyoteTime. */
export const COYOTE_TIME = DEFAULT_PHYSICS.coyoteTime;

/**
 * Finite-difference angle (radians) for shell normals.
 * Gradient is formed per meter of surface arc: ΔR / (ε · R).
 */
const NORMAL_EPS = 1.6e-3;

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
  return terrainRadius(dir) + physics.boardClearance;
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
 *
 * `NORMAL_EPS` is an angle on the unit sphere; divide by arc length
 * (ε · R) so ∇R is meters-per-meter — otherwise deep bowls make n ⊥ radial
 * and the contact spring launches the board.
 */
export function sampleShellNormal(
  dir: THREE.Vector3,
  out = new THREE.Vector3(),
): THREE.Vector3 {
  shellTangentBasis(dir, _east, _north);

  const r0 = rideRadius(dir);
  const arc = Math.max(NORMAL_EPS * r0, 1e-4);

  _tmp.copy(dir).addScaledVector(_east, NORMAL_EPS).normalize();
  const rE = rideRadius(_tmp);
  _tmp.copy(dir).addScaledVector(_north, NORMAL_EPS).normalize();
  const rN = rideRadius(_tmp);

  // ∇_arc R in the tangent plane → outward normal ≈ dir − ∇_arc R.
  const dRdE = (rE - r0) / arc;
  const dRdN = (rN - r0) / arc;
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
  if (altitude > physics.softBand) return "airborne";
  if (altitude > 0) return "soft";
  return "planted";
}

/**
 * Radial field + contact support along the surface normal.
 * Support never acts in the tangent plane (skate feel).
 *
 * Returns the contact regime after evaluating altitude.
 *
 * @param grounded — when false, soft-band cushion is scaled by airHoverAssist
 *   (v1 air hover assist). When true, slopeSlide adds extra downhill pull.
 */
export function applyRideShellField(
  pos: THREE.Vector3,
  vel: THREE.Vector3,
  mass: number,
  dt: number,
  shell: RideShellSample,
  grounded = false,
): ContactRegime {
  sampleRideShell(pos, shell);
  const h = shell.altitude;
  const n = shell.normal;
  const regime = contactRegime(h);

  _force.set(0, 0, 0);

  // Gravity toward moon center — never along the surface normal. On steep
  // bowl walls, −normal gravity (plus thrust) was launching the board to space.
  let g = physics.gLunar;
  const vN = vel.dot(n);
  // Snappier descent once past apex so every air commits to a clean plant.
  if (!grounded && vN < 0 && physics.descentGravityBoost > 0) {
    const fall = THREE.MathUtils.clamp(-vN / 8, 0, 1);
    g *= 1 + physics.descentGravityBoost * fall;
  }
  _force.addScaledVector(shell.dir, -g * mass);

  // Arcade slope slide: extra tangent gravity when planted (v1 driftSlide).
  if (grounded && physics.slopeSlide > 0) {
    const gN = _force.dot(n);
    _tmp.copy(_force).addScaledVector(n, -gN);
    _force.addScaledVector(_tmp, physics.slopeSlide);
  }

  if (regime === "soft") {
    // Preload only while approaching / settling — never boost an outgoing lip.
    const assist = grounded ? 1 : physics.airHoverAssist;
    if (assist > 0 && vN < 0.2) {
      const softH = physics.softBand - h;
      _force.addScaledVector(n, physics.softStiffness * softH * assist);
      if (vN < 0) {
        _force.addScaledVector(n, -physics.normalDamping * 0.4 * vN * assist);
      }
    }
  } else if (regime === "planted") {
    _force.addScaledVector(n, -physics.compressStiffness * h);
    // Unilateral damper — only resist penetration, not jumps/lips.
    if (vN < 0) {
      _force.addScaledVector(n, -physics.normalDamping * vN);
    }
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
  if (shell.altitude >= -physics.maxPenetration) return;

  pos.copy(shell.dir).multiplyScalar(shell.radius);
  const vN = vel.dot(shell.normal);
  if (vN < 0) {
    vel.addScaledVector(shell.normal, -vN);
  }
}

/**
 * Hard stick to the ride shell while grounded — springs alone can't supply
 * centripetal force on steep bowl walls, so the board separates and launches.
 *
 * Release on clear outward normal speed alone. Requiring altitude > ε was a
 * catch-22: stick snaps you to the shell every substep, so you never clear ε
 * unless already going ~18 m/s outward. Also never damp outward loft here —
 * killing 85% of vN per substep annihilated jumps and lip launches.
 */
export function stickToShell(
  pos: THREE.Vector3,
  vel: THREE.Vector3,
  grounded: boolean,
  shell: RideShellSample,
): boolean {
  sampleRideShell(pos, shell);
  if (!grounded) return false;

  const vN = vel.dot(shell.normal);
  // Lip / jump / spring loft — let the board leave.
  if (vN > 0.85) {
    return false;
  }

  if (shell.altitude < physics.softBand * 0.85) {
    pos.copy(shell.dir).multiplyScalar(shell.radius);
    sampleRideShell(pos, shell);
    const vN2 = vel.dot(shell.normal);
    // Centripetal assist only: kill inward normal speed, leave outward alone.
    if (vN2 < 0) {
      vel.addScaledVector(shell.normal, -vN2);
    }
    return true;
  }
  return false;
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
 *
 * Re-plant uses landingCatchSpeed (v1 hoverLandingSpeed / canReengageHover):
 * refuse to catch while lofting out faster than the gate.
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
  const catchSpeed = physics.landingCatchSpeed;

  let nextGrounded = grounded;
  let nextAir = airTime;
  let nextCoyote = coyote;

  // Plant only while compressing / settling — never while lofting out.
  // `h <= 0` alone used to re-ground mid-jump and hand you back to stickToShell.
  if (
    vN <= catchSpeed &&
    (regime === "planted" ||
      (regime === "soft" &&
        vN <= catchSpeed * 0.27 &&
        h < physics.softBand * 0.5))
  ) {
    nextGrounded = true;
    nextAir = 0;
    nextCoyote = physics.coyoteTime;
  }

  if (nextGrounded) {
    if (vN > catchSpeed) {
      // Rising clear — leave even if still near the shell this substep.
      nextGrounded = false;
      nextAir = 0;
      nextCoyote = physics.coyoteTime;
    } else if (h > physics.softBand) {
      nextGrounded = false;
      nextAir = 0;
      nextCoyote = physics.coyoteTime;
    } else {
      nextAir = 0;
      nextCoyote = physics.coyoteTime;
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
  if (vN < physics.jumpSpeed) {
    vel.addScaledVector(normal, physics.jumpSpeed - Math.max(0, vN));
  }
  return { jumped: true, grounded: false, coyote: 0 };
}

/** Allocate a reusable shell sample (for hot loops). */
export function createShellSample(): RideShellSample {
  return {
    dir: new THREE.Vector3(0, 0, 1),
    radius: MOON_RADIUS + physics.boardClearance,
    normal: new THREE.Vector3(0, 0, 1),
    altitude: 0,
  };
}
