import * as THREE from "three";
import {
  MOON_RADIUS,
  SPAWN_DIR,
  sampleHeightDir,
  sampleNormalDir,
  surfacePoint,
} from "./terrain";

/**
 * Surface gravity (m/s²) at r = MOON_RADIUS.
 * Softened inverse-square: a(r) = G · ((R+S)/(r+S))² toward the center.
 * S flattens the near-surface gradient (crater floors vs rims) while still
 * weakening with altitude so vacuum orbits work.
 */
export const G = 9.6;

/**
 * Softening length. S=0 is pure 1/r²; larger S → flatter skate-band gravity.
 * ~2R keeps floor/rim within a few percent while orbit altitude still thins g.
 */
export const GRAVITY_SOFT = MOON_RADIUS * 2;

/** Softened gravitational strength K = G (R+S)² — a = K/(r+S)². */
export const MU = G * (MOON_RADIUS + GRAVITY_SOFT) * (MOON_RADIUS + GRAVITY_SOFT);

export const MASS = 18;
export const BOARD_CLEARANCE = 0.18;

/** Continuous push force along the deck (N) — ground only. */
export const PUSH_FORCE = 70;

/** Board jetpack thrust along local forward (N). */
export const JETPACK_FORCE = 95;

/** W/S (push / brake) only within this height above the deck clearance. */
export const NEAR_GROUND = 2.8;

/**
 * Quadratic air-drag coefficient at the surface.
 * Falls off with altitude so vacuum orbits are possible.
 */
export const AIR_DRAG = 0.045;

/** Atmosphere scale height (world units) for drag falloff. */
export const ATMOS_SCALE_HEIGHT = 28;

/** Rolling resistance ≈ μ_r · N, opposing tangential velocity. */
export const MU_ROLL = 0.035;

/** Lateral wheel grip (Coulomb). */
export const MU_LATERAL = 0.55;

/** Kinetic friction while braking with S (ground only). */
export const MU_BRAKE = 0.55;

/** Coefficient of restitution on landing. */
export const RESTITUTION = 0.08;

/** Ollie impulse (N·s) along the surface normal. */
export const OLLIE_IMPULSE = 72;

/**
 * Yaw rate at full lean near standstill (rad/s).
 * Positive lean (A) increases yaw — lean into the turn.
 */
export const STEER_RATE = 2.8;

/**
 * Grounded steer softens with tangential speed: authority ≈ 1/(1+v/v½).
 * At STEER_SPEED_HALF, full lean turns at half the low-speed rate.
 */
export const STEER_SPEED_HALF = 11;

/** How fast lean approaches held A/D (1/s). */
export const LEAN_ENGAGE = 5.5;

/** How fast lean returns to neutral when A/D released (1/s). */
export const LEAN_RECOVER = 3.2;

/** Visual / kinematic lean magnitude at |lean| = 1 (rad). */
export const LEAN_ANGLE = 0.44;

/** How fast pitch approaches held R/F (1/s). */
export const PITCH_ENGAGE = 5.5;

/** How fast pitch returns to neutral when R/F released (1/s). */
export const PITCH_RECOVER = 3.2;

/** Visual pitch magnitude at |pitch| = 1 (rad). R = nose up. */
export const PITCH_ANGLE = 0.4;

/** Airborne pitch rate at full R/F (rad/s) — rotates board attitude. */
export const PITCH_RATE = 2.2;

/** Extra lateral grip while pushing. */
export const MU_LATERAL_PUSH = 1.15;

/** Integrator subdivisions. */
const SUBSTEPS = 4;

export type ControlInput = {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  /** R — nose up / weight back. */
  pitchUp: boolean;
  /** F — nose down / weight forward. */
  pitchDown: boolean;
  jump: boolean;
  /** Hold Shift — thrust along board up (works in vacuum). */
  jetpack: boolean;
};

export type BodyState = {
  /** Moon-centered Cartesian position. */
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  /** Heading about the local surface normal (rad). */
  yaw: number;
  /**
   * Continuous rail lean in [-1, 1]. Positive = lean left (A) = turn left.
   * Smoothly tracks A/D; yaw rate is driven by lean, not raw keys.
   */
  lean: number;
  /**
   * Continuous nose pitch in [-1, 1]. Positive = nose up (R).
   * Visual on ground; rotates attitude while airborne.
   */
  pitch: number;
  grounded: boolean;
  /** Surface normal — updated on contact, held inertial while airborne. */
  normal: THREE.Vector3;
  normalForce: number;
};

const _radial = new THREE.Vector3();
const _east = new THREE.Vector3();
const _north = new THREE.Vector3();
const _force = new THREE.Vector3();
const _accel = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _tangent = new THREE.Vector3();
const _long = new THREE.Vector3();
const _n = new THREE.Vector3();
const _refFwd = new THREE.Vector3();
const _surface = new THREE.Vector3();
const _prevFwd = new THREE.Vector3();

/** Circular-orbit speed at radius `r` from the moon center. */
export function circularOrbitSpeed(r: number): number {
  const rr = Math.max(r, 1e-4);
  const den = rr + GRAVITY_SOFT;
  return Math.sqrt((MU * rr) / (den * den));
}

/** Escape speed at radius `r` (softened −K/(r+S) potential). */
export function escapeSpeed(r: number): number {
  const rr = Math.max(r, 1e-4);
  return Math.sqrt((2 * MU) / (rr + GRAVITY_SOFT));
}

/** Inward gravity acceleration magnitude at radius `r`. */
export function gravityAccel(r: number): number {
  const rr = Math.max(r, 1e-4);
  const den = rr + GRAVITY_SOFT;
  return MU / (den * den);
}

/** Air density factor in [0, 1] — full at the crust, ~0 in vacuum. */
export function atmosphereDensity(r: number): number {
  const alt = Math.max(0, r - MOON_RADIUS);
  return Math.exp(-alt / ATMOS_SCALE_HEIGHT);
}

/**
 * Board axes in the local tangent frame.
 * Yaw=0 faces geographic south (−north). Left increases yaw (CCW from outside).
 */
export function boardAxes(
  yaw: number,
  normal: THREE.Vector3,
  forward: THREE.Vector3,
  right: THREE.Vector3,
): void {
  _east.set(0, 1, 0).cross(normal);
  if (_east.lengthSq() < 1e-8) {
    _east.set(1, 0, 0).cross(normal);
  }
  _east.normalize();
  _north.crossVectors(normal, _east).normalize();

  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  forward
    .copy(_north)
    .multiplyScalar(-c)
    .addScaledVector(_east, s)
    .normalize();
  right.crossVectors(normal, forward).normalize();
  forward.crossVectors(right, normal).normalize();
}

/** Re-express yaw so forward stays continuous when the normal changes. */
function retargetYaw(
  body: BodyState,
  newNormal: THREE.Vector3,
  prevForward: THREE.Vector3,
): void {
  _prevFwd
    .copy(prevForward)
    .addScaledVector(newNormal, -prevForward.dot(newNormal));
  if (_prevFwd.lengthSq() < 1e-8) return;
  _prevFwd.normalize();

  _east.set(0, 1, 0).cross(newNormal);
  if (_east.lengthSq() < 1e-8) _east.set(1, 0, 0).cross(newNormal);
  _east.normalize();
  _north.crossVectors(newNormal, _east).normalize();

  const x = _prevFwd.dot(_east);
  const y = -_prevFwd.dot(_north);
  body.yaw = Math.atan2(x, y);
}

export function createBody(): BodyState {
  const normal = new THREE.Vector3();
  sampleNormalDir(SPAWN_DIR, normal);
  const pos = surfacePoint(SPAWN_DIR, BOARD_CLEARANCE);
  const yaw = 0;
  boardAxes(yaw, normal, _refFwd, _right);
  return {
    pos,
    vel: _refFwd.clone().multiplyScalar(1.5),
    yaw,
    lean: 0,
    pitch: 0,
    grounded: true,
    normal,
    normalForce: MASS * G,
  };
}

/**
 * Semi-implicit Euler with inverse-square gravity and non-sticky contact.
 * High-speed paths go ballistic over crevices; circular orbit is reachable
 * above the atmosphere.
 */
export function stepBody(
  body: BodyState,
  input: ControlInput,
  dt: number,
): void {
  const step = dt / SUBSTEPS;
  let jumpUsed = false;
  for (let i = 0; i < SUBSTEPS; i++) {
    jumpUsed = substep(body, input, step, jumpUsed) || jumpUsed;
  }
}

function substep(
  body: BodyState,
  input: ControlInput,
  dt: number,
  jumpUsed: boolean,
): boolean {
  // Deck follows the crust normal while grounded. In the air the attitude is
  // inertial — terrain under a jump must not twist the pup.
  boardAxes(body.yaw, body.normal, _prevFwd, _right);
  if (body.grounded) {
    sampleNormalAtSafe(body.pos, _n);
    retargetYaw(body, _n, _prevFwd);
    body.normal.copy(_n);
  }

  const n = body.normal;
  boardAxes(body.yaw, n, _forward, _right);

  // Smooth lean like a real board: engage into A/D, ease out on release,
  // and cross from A→D without snapping through neutral.
  const leanTarget = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  const leanRate = leanTarget === 0 ? LEAN_RECOVER : LEAN_ENGAGE;
  body.lean +=
    (leanTarget - body.lean) * (1 - Math.exp(-leanRate * dt));
  if (Math.abs(body.lean) < 1e-4) body.lean = 0;

  // Smooth pitch: R = nose up, F = nose down.
  const pitchTarget = (input.pitchUp ? 1 : 0) - (input.pitchDown ? 1 : 0);
  const pitchEase = pitchTarget === 0 ? PITCH_RECOVER : PITCH_ENGAGE;
  body.pitch +=
    (pitchTarget - body.pitch) * (1 - Math.exp(-pitchEase * dt));
  if (Math.abs(body.pitch) < 1e-4) body.pitch = 0;

  // Turn toward the leaned rail. Grounded: high speed → wider radius.
  let steer = STEER_RATE;
  if (body.grounded) {
    const vn0 = body.vel.dot(n);
    _tangent.copy(body.vel).addScaledVector(n, -vn0);
    const tanSpeed = _tangent.length();
    steer /= 1 + tanSpeed / STEER_SPEED_HALF;
  } else {
    steer *= 0.55;
  }
  body.yaw += body.lean * steer * dt;
  boardAxes(body.yaw, body.normal, _forward, _right);

  // Airborne: R/F pitches the deck around the lateral axis (nose up = −angle).
  if (!body.grounded && Math.abs(body.pitch) > 1e-4) {
    const dPitch = -body.pitch * PITCH_RATE * dt;
    _prevFwd.copy(_forward);
    body.normal.applyAxisAngle(_right, dPitch).normalize();
    _prevFwd.applyAxisAngle(_right, dPitch).normalize();
    retargetYaw(body, body.normal, _prevFwd);
    boardAxes(body.yaw, body.normal, _forward, _right);
  }

  const r = Math.max(body.pos.length(), 1e-4);
  _radial.copy(body.pos).multiplyScalar(1 / r);

  // How far above the crust (along surface normal) — gates wheel thrust.
  const h0 = sampleHeightDir(_radial);
  sampleNormalDir(_radial, _n);
  _surface.copy(_radial).multiplyScalar(MOON_RADIUS + h0);
  const alt = heightAbove(_surface, _n, body.pos);
  const nearGround = body.grounded || alt < BOARD_CLEARANCE + NEAR_GROUND;

  // Gravity toward the moon center. On the deck, drop the tangential part so
  // radial pull can't drain the pup into crater bowls — only the into-board
  // component remains. Airborne keeps full CoM gravity for orbits.
  const g = gravityAccel(r);
  _force.copy(_radial).multiplyScalar(-MASS * g);
  if (body.grounded) {
    const intoDeck = _force.dot(n);
    _force.copy(n).multiplyScalar(intoDeck);
  }

  // Wheel push — only with traction (on / very near the crust).
  if (nearGround && input.forward) {
    _long.copy(_forward).addScaledVector(n, -_forward.dot(n));
    if (_long.lengthSq() > 1e-8) {
      _long.normalize();
      _force.addScaledVector(_long, PUSH_FORCE);
    }
  }

  // Jetpack: Shift + W/S along board forward/back (Shift alone = forward).
  if (input.jetpack) {
    let axis = 0;
    if (input.forward) axis += 1;
    if (input.back) axis -= 1;
    if (axis === 0) axis = 1;
    _long.copy(_forward).addScaledVector(n, -_forward.dot(n));
    if (_long.lengthSq() > 1e-8) {
      _long.normalize();
      _force.addScaledVector(_long, axis * JETPACK_FORCE);
    }
  }

  const speed = body.vel.length();
  const rho = atmosphereDensity(r);
  if (speed > 1e-4 && rho > 1e-4) {
    _force.addScaledVector(body.vel, -AIR_DRAG * rho * speed);
  }

  if (body.grounded) {
    const N = Math.max(body.normalForce, MASS * g * 0.25);
    const vn = body.vel.dot(n);
    _tangent.copy(body.vel).addScaledVector(n, -vn);
    const tanSpeed = _tangent.length();

    if (tanSpeed > 1e-4) {
      const tHat = _long.copy(_tangent).multiplyScalar(1 / tanSpeed);
      _force.addScaledVector(tHat, -MU_ROLL * N);
      // S = brake only on the ground (not a second "push" channel).
      if (input.back) {
        _force.addScaledVector(tHat, -MU_BRAKE * N);
      }
    }

    const muLat = nearGround && input.forward ? MU_LATERAL_PUSH : MU_LATERAL;
    const vLat = body.vel.dot(_right);
    if (Math.abs(vLat) > 1e-4) {
      const maxLat = muLat * N;
      const latForce = THREE.MathUtils.clamp(
        -vLat * MASS * 16,
        -maxLat,
        maxLat,
      );
      _force.addScaledVector(_right, latForce);
    }
  }

  _accel.copy(_force).multiplyScalar(1 / MASS);
  body.vel.addScaledVector(_accel, dt);
  body.pos.addScaledVector(body.vel, dt);

  // Sample crust under the new position.
  const r2 = Math.max(body.pos.length(), 1e-4);
  _radial.copy(body.pos).multiplyScalar(1 / r2);
  const h = sampleHeightDir(_radial);
  sampleNormalDir(_radial, _n);
  _surface.copy(_radial).multiplyScalar(MOON_RADIUS + h);

  const height = heightAbove(_surface, _n, body.pos);
  const penetration = BOARD_CLEARANCE - height;
  const wantJump = input.jump && !jumpUsed;

  // Non-sticky: only resolve while intersecting the crust. When a crevice
  // drops away under a fast pup, height rises above clearance → ballistic.
  if (penetration >= 0) {
    boardAxes(body.yaw, body.normal, _prevFwd, _right);
    retargetYaw(body, _n, _prevFwd);
    body.normal.copy(_n);

    // Correct along the surface normal only. Snapping to the radial sample
    // point walks the pup downhill inside concave bowls.
    body.pos.addScaledVector(_n, BOARD_CLEARANCE - height);

    const contactN = body.normal;
    const vn = body.vel.dot(contactN);
    let jn = 0;
    if (vn < 0) {
      jn = -(1 + RESTITUTION) * MASS * vn;
      body.vel.addScaledVector(contactN, jn / MASS);
    }

    boardAxes(body.yaw, contactN, _forward, _right);
    const vLat = body.vel.dot(_right);
    if (Math.abs(vLat) > 1e-5 && jn > 0) {
      const maxJt = MU_LATERAL * jn;
      const jt = Math.min(MASS * Math.abs(vLat), maxJt);
      body.vel.addScaledVector(_right, -Math.sign(vLat) * (jt / MASS));
    }

    const gNow = gravityAccel(body.pos.length());
    body.normalForce = Math.max(jn / Math.max(dt, 1e-4), MASS * gNow * 0.2);
    body.grounded = true;

    if (wantJump && body.vel.length() > 0.35) {
      body.vel.addScaledVector(contactN, OLLIE_IMPULSE / MASS);
      body.grounded = false;
      body.normalForce = 0;
      return true;
    }
  } else {
    body.grounded = false;
    body.normalForce = 0;
  }
  return false;
}

function heightAbove(
  surface: THREE.Vector3,
  normal: THREE.Vector3,
  pos: THREE.Vector3,
): number {
  return (
    (pos.x - surface.x) * normal.x +
    (pos.y - surface.y) * normal.y +
    (pos.z - surface.z) * normal.z
  );
}

function sampleNormalAtSafe(pos: THREE.Vector3, out: THREE.Vector3): void {
  if (pos.lengthSq() < 1e-8) {
    out.copy(SPAWN_DIR);
    return;
  }
  sampleNormalDir(_radial.copy(pos).normalize(), out);
}

export function boardSpeed(body: BodyState): number {
  boardAxes(body.yaw, body.normal, _forward, _right);
  return body.vel.dot(_forward);
}
