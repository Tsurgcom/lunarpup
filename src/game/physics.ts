import * as THREE from "three";
import { sampleHeight, sampleNormal } from "./terrain";

/** Moon surface gravity (m/s²). */
export const G = 2.4;

export const MASS = 18;
export const BOARD_CLEARANCE = 0.12;

/** Continuous push force along the deck (N). */
export const PUSH_FORCE = 70;

/** Quadratic air drag coefficient: F = -c |v| v */
export const AIR_DRAG = 0.12;

/** Rolling resistance ≈ μ_r · N, opposing tangential velocity. */
export const MU_ROLL = 0.035;

/** Lateral wheel grip (Coulomb). */
export const MU_LATERAL = 0.55;

/** Kinetic friction while braking. */
export const MU_BRAKE = 0.55;

/** Coefficient of restitution on landing. */
export const RESTITUTION = 0.08;

/** Ollie impulse (N·s) along the surface normal. */
export const OLLIE_IMPULSE = 72;

/** Yaw rate (rad/s). */
export const STEER_RATE = 2.8;

/** Extra lateral grip while pushing. */
export const MU_LATERAL_PUSH = 1.15;

export type ControlInput = {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  jump: boolean;
  brake: boolean;
};

export type BodyState = {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  yaw: number;
  grounded: boolean;
  /** Surface normal — updated on contact, held inertial while airborne. */
  normal: THREE.Vector3;
  normalForce: number;
};

export function createBody(x = 0, z = 14): BodyState {
  const y = sampleHeight(x, z) + BOARD_CLEARANCE;
  const normal = new THREE.Vector3(0, 1, 0);
  sampleNormal(x, z, normal);
  return {
    pos: new THREE.Vector3(x, y, z),
    vel: new THREE.Vector3(0, 0, -1.5),
    yaw: Math.PI,
    grounded: true,
    normal,
    normalForce: MASS * G,
  };
}

export function boardAxes(
  yaw: number,
  normal: THREE.Vector3,
  forward: THREE.Vector3,
  right: THREE.Vector3,
): void {
  forward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
  forward.addScaledVector(normal, -forward.dot(normal));
  if (forward.lengthSq() < 1e-8) {
    forward.set(0, 0, -1).addScaledVector(normal, normal.z).normalize();
  } else {
    forward.normalize();
  }
  right.crossVectors(normal, forward).normalize();
  forward.crossVectors(right, normal).normalize();
}

const _force = new THREE.Vector3();
const _accel = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _tangent = new THREE.Vector3();
const _long = new THREE.Vector3();
const _n = new THREE.Vector3();

/**
 * Semi-implicit Euler with Newtonian forces and impulsive ground contact.
 * Grounded ⇔ penetrating the heightfield. No hover, coyote time, or air leveling.
 */
export function stepBody(body: BodyState, input: ControlInput, dt: number): void {
  if (body.grounded) {
    sampleNormal(body.pos.x, body.pos.z, body.normal);
  }

  const n = body.normal;
  boardAxes(body.yaw, n, _forward, _right);

  const steer = body.grounded ? STEER_RATE : STEER_RATE * 0.75;
  if (input.left) body.yaw += steer * dt;
  if (input.right) body.yaw -= steer * dt;
  boardAxes(body.yaw, n, _forward, _right);

  _force.set(0, -MASS * G, 0);

  if (input.forward) {
    _force.addScaledVector(_forward, PUSH_FORCE);
  }

  const speed = body.vel.length();
  if (speed > 1e-4) {
    _force.addScaledVector(body.vel, -AIR_DRAG * speed);
  }

  if (body.grounded) {
    const N = Math.max(body.normalForce, MASS * G * 0.25);
    const vn = body.vel.dot(n);
    _tangent.copy(body.vel).addScaledVector(n, -vn);
    const tanSpeed = _tangent.length();

    if (tanSpeed > 1e-4) {
      const tHat = _long.copy(_tangent).multiplyScalar(1 / tanSpeed);
      _force.addScaledVector(tHat, -MU_ROLL * N);
      if (input.brake || input.back) {
        _force.addScaledVector(tHat, -MU_BRAKE * N);
      }
    }

    const muLat = input.forward ? MU_LATERAL_PUSH : MU_LATERAL;
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

  sampleNormal(body.pos.x, body.pos.z, _n);
  const groundY = sampleHeight(body.pos.x, body.pos.z) + BOARD_CLEARANCE;
  const penetration = groundY - body.pos.y;

  if (penetration >= 0) {
    body.normal.copy(_n);
    body.pos.y = groundY;

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

    body.normalForce = Math.max(
      jn / Math.max(dt, 1e-4),
      MASS * G * Math.max(0.2, contactN.y),
    );
    body.grounded = true;

    if (input.jump && speed > 0.35) {
      body.vel.addScaledVector(contactN, OLLIE_IMPULSE / MASS);
      body.grounded = false;
      body.normalForce = 0;
    }
  } else {
    body.grounded = false;
    body.normalForce = 0;
  }
}

export function boardSpeed(body: BodyState): number {
  boardAxes(body.yaw, body.normal, _forward, _right);
  _long.copy(body.vel);
  return _long.dot(_forward);
}
