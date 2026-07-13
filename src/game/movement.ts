import * as THREE from "three";
import { SPAWN_DIR, spawnPosition } from "./moon";

export const LEAN_ANGLE = 0.44;
export const PITCH_ANGLE = 0.4;

/** Integrator mass (kg) — only scales force → accel. */
export const MASS = 18;

/** Continuous W thrust (N). */
const THRUST = 220;
/** Reverse thrust fraction of THRUST. */
const REVERSE_MULT = 0.85;
/** Shift multiplies thrust. */
const BOOST_MULT = 1.65;
/** Quadratic drag coefficient. */
const DRAG = 0.04;
/** Linear coast damping (N·s/m scale via velocity). */
const COAST_FRICTION = 8;
/** Yaw rate at full lean near standstill (rad/s). */
const STEER_RATE = 2.8;
/** Steer softens: authority ≈ 1/(1+v/v½). */
const STEER_SPEED_HALF = 14;
/** Airborne pitch rate at full R/F (rad/s). */
const PITCH_RATE = 2.2;

const LEAN_ENGAGE = 5.5;
const LEAN_RECOVER = 3.2;
const PITCH_ENGAGE = 5.5;
const PITCH_RECOVER = 3.2;

const SUBSTEPS = 4;

/** Peak speed for HUD / speed-line ratio. */
export const MAX_SPEED = 40;

const _east = new THREE.Vector3();
const _north = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _force = new THREE.Vector3();
const _prevFwd = new THREE.Vector3();

export type ControlInput = {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  pitchUp: boolean;
  pitchDown: boolean;
  boosting: boolean;
};

export type PlayerState = {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  yaw: number;
  lean: number;
  pitch: number;
  /** Board up axis (free space — not a surface normal). */
  up: THREE.Vector3;
  boosting: boolean;
};

/**
 * Board axes in the local frame about `up`.
 * Yaw=0 faces geographic south (−north). Left increases yaw (CCW from outside).
 */
export function boardAxes(
  yaw: number,
  up: THREE.Vector3,
  forward: THREE.Vector3,
  right: THREE.Vector3,
): void {
  _east.set(0, 1, 0).cross(up);
  if (_east.lengthSq() < 1e-8) {
    _east.set(1, 0, 0).cross(up);
  }
  _east.normalize();
  _north.crossVectors(up, _east).normalize();

  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  forward.copy(_north).multiplyScalar(-c).addScaledVector(_east, s).normalize();
  right.crossVectors(up, forward).normalize();
  forward.crossVectors(right, up).normalize();
}

/** Re-express yaw so forward stays continuous when up changes. */
function retargetYaw(
  state: PlayerState,
  newUp: THREE.Vector3,
  prevForward: THREE.Vector3,
): void {
  _prevFwd.copy(prevForward).addScaledVector(newUp, -prevForward.dot(newUp));
  if (_prevFwd.lengthSq() < 1e-8) return;
  _prevFwd.normalize();

  _east.set(0, 1, 0).cross(newUp);
  if (_east.lengthSq() < 1e-8) _east.set(1, 0, 0).cross(newUp);
  _east.normalize();
  _north.crossVectors(newUp, _east).normalize();

  const x = _prevFwd.dot(_east);
  const y = -_prevFwd.dot(_north);
  state.yaw = Math.atan2(x, y);
}

export function createPlayer(): PlayerState {
  const up = SPAWN_DIR.clone();
  const pos = spawnPosition();
  const yaw = 0;
  boardAxes(yaw, up, _forward, _right);
  return {
    pos,
    vel: _forward.clone().multiplyScalar(2),
    yaw,
    lean: 0,
    pitch: 0,
    up,
    boosting: false,
  };
}

/**
 * Free-space semi-implicit Euler: thrust / drag / lean yaw / pitch attitude.
 * No gravity, no surface, no heightfield.
 */
export function stepPlayer(
  state: PlayerState,
  input: ControlInput,
  dt: number,
): void {
  const step = dt / SUBSTEPS;
  for (let i = 0; i < SUBSTEPS; i++) {
    substep(state, input, step);
  }
  state.boosting = input.boosting;
}

function substep(state: PlayerState, input: ControlInput, dt: number): void {
  boardAxes(state.yaw, state.up, _forward, _right);

  const leanTarget = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  const leanRate = leanTarget === 0 ? LEAN_RECOVER : LEAN_ENGAGE;
  state.lean += (leanTarget - state.lean) * (1 - Math.exp(-leanRate * dt));
  if (Math.abs(state.lean) < 1e-4) state.lean = 0;

  const pitchTarget = (input.pitchUp ? 1 : 0) - (input.pitchDown ? 1 : 0);
  const pitchRate = pitchTarget === 0 ? PITCH_RECOVER : PITCH_ENGAGE;
  state.pitch += (pitchTarget - state.pitch) * (1 - Math.exp(-pitchRate * dt));
  if (Math.abs(state.pitch) < 1e-4) state.pitch = 0;

  const speed = state.vel.length();
  const steer = STEER_RATE / (1 + speed / STEER_SPEED_HALF);
  state.yaw += state.lean * steer * dt;
  boardAxes(state.yaw, state.up, _forward, _right);

  // R/F pitches the board about the lateral axis (nose up = −angle).
  if (Math.abs(state.pitch) > 1e-4) {
    const dPitch = -state.pitch * PITCH_RATE * dt;
    _prevFwd.copy(_forward);
    state.up.applyAxisAngle(_right, dPitch).normalize();
    _prevFwd.applyAxisAngle(_right, dPitch).normalize();
    retargetYaw(state, state.up, _prevFwd);
    boardAxes(state.yaw, state.up, _forward, _right);
  }

  _force.set(0, 0, 0);

  let axis = 0;
  if (input.forward) axis += 1;
  if (input.back) axis -= REVERSE_MULT;
  if (axis !== 0) {
    const thrust = THRUST * (input.boosting ? BOOST_MULT : 1);
    _force.addScaledVector(_forward, axis * thrust);
  }

  if (speed > 1e-4) {
    _force.addScaledVector(state.vel, -DRAG * speed);
    _force.addScaledVector(state.vel, -COAST_FRICTION);
  }

  // Soft lateral grip in the board frame.
  const vLat = state.vel.dot(_right);
  if (Math.abs(vLat) > 1e-4) {
    _force.addScaledVector(_right, -vLat * MASS * 6);
  }

  state.vel.addScaledVector(_force, dt / MASS);
  state.pos.addScaledVector(state.vel, dt);
}

export function getSpeedRatio(speed: number): number {
  return THREE.MathUtils.clamp(speed / MAX_SPEED, 0, 1);
}
