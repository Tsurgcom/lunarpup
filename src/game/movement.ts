import * as THREE from "three";
import { MAX_SPEED, SPAWN_DIR, spawnPosition } from "./moon";
import {
  antiTunnel,
  applyRideShellField,
  BOARD_CLEARANCE,
  contactRegime,
  createShellSample,
  type RideShellSample,
  SOFT_BAND,
  tryJump,
  updateContactState,
} from "./rideShell";

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
/** Linear coast damping when planted (N·s/m scale via velocity). */
const COAST_FRICTION = 8;
/** Lighter coast damping in air. */
const AIR_COAST = 2.5;
/** Yaw rate at full lean near standstill (rad/s). */
const STEER_RATE = 2.8;
/** Steer softens: authority ≈ 1/(1+v/v½). */
const STEER_SPEED_HALF = 14;
/** Airborne pitch rate at full R/F (rad/s). */
const PITCH_RATE = 2.2;
/** How quickly board up tracks surface normal when planted. */
const UP_TRACK = 14;
/** Soft-contact up blend rate. */
const UP_TRACK_SOFT = 5;

const LEAN_ENGAGE = 5.5;
const LEAN_RECOVER = 3.2;
const PITCH_ENGAGE = 5.5;
const PITCH_RECOVER = 3.2;

const SUBSTEPS = 4;

export { MAX_SPEED };

const _east = new THREE.Vector3();
const _north = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _force = new THREE.Vector3();
const _prevFwd = new THREE.Vector3();
let _shell: RideShellSample | null = null;

function shellScratch(): RideShellSample {
  if (!_shell) _shell = createShellSample();
  return _shell;
}

export type ControlInput = {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  pitchUp: boolean;
  pitchDown: boolean;
  boosting: boolean;
  jump: boolean;
};

export type PlayerState = {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  yaw: number;
  lean: number;
  pitch: number;
  /** Board up axis — tracks surface normal when planted. */
  up: THREE.Vector3;
  boosting: boolean;
  grounded: boolean;
  /** Continuous airborne time (s). */
  airTime: number;
  /** Remaining coyote window (s). */
  coyote: number;
  /** Last contact normal (outward). */
  contactNormal: THREE.Vector3;
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

function blendUpToward(
  state: PlayerState,
  target: THREE.Vector3,
  rate: number,
  dt: number,
): void {
  _prevFwd.copy(_forward);
  const t = 1 - Math.exp(-rate * dt);
  state.up.lerp(target, t).normalize();
  retargetYaw(state, state.up, _prevFwd);
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
    grounded: false,
    airTime: 0,
    coyote: 0,
    contactNormal: up.clone(),
  };
}

/**
 * Ride-shell integrator: lunar radial field + contact plant, thrust / drag /
 * lean yaw, and free attitude pitch while airborne.
 */
export function stepPlayer(
  state: PlayerState,
  input: ControlInput,
  dt: number,
): void {
  const step = dt / SUBSTEPS;
  let jumpConsumed = false;
  for (let i = 0; i < SUBSTEPS; i++) {
    const jumpThis: boolean = input.jump && !jumpConsumed;
    const didJump = substep(state, input, step, jumpThis);
    if (didJump) jumpConsumed = true;
  }
  state.boosting = input.boosting;
}

function substep(
  state: PlayerState,
  input: ControlInput,
  dt: number,
  jumpPressed: boolean,
): boolean {
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

  // R/F pitches the board about the lateral axis only while airborne.
  if (!state.grounded && Math.abs(state.pitch) > 1e-4) {
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

  const coast = state.grounded ? COAST_FRICTION : AIR_COAST;
  if (speed > 1e-4) {
    _force.addScaledVector(state.vel, -DRAG * speed);
    _force.addScaledVector(state.vel, -coast);
  }

  // Lateral grip only when planted (skate rails).
  if (state.grounded) {
    const vLat = state.vel.dot(_right);
    if (Math.abs(vLat) > 1e-4) {
      _force.addScaledVector(_right, -vLat * MASS * 6);
    }
  }

  state.vel.addScaledVector(_force, dt / MASS);

  // Ride-shell gravity + contact support.
  const shell = shellScratch();
  applyRideShellField(state.pos, state.vel, MASS, dt, shell);
  state.contactNormal.copy(shell.normal);

  // Speed cap to keep substep travel under clearance.
  const spd = state.vel.length();
  if (spd > MAX_SPEED) {
    state.vel.multiplyScalar(MAX_SPEED / spd);
  }

  state.pos.addScaledVector(state.vel, dt);
  antiTunnel(state.pos, state.vel, shell);
  state.contactNormal.copy(shell.normal);

  const contact = updateContactState(
    state.grounded,
    state.airTime,
    state.coyote,
    shell,
    state.vel,
    dt,
  );
  state.grounded = contact.grounded;
  state.airTime = contact.airTime;
  state.coyote = contact.coyote;

  let jumped = false;
  const jump = tryJump(
    state.vel,
    state.contactNormal,
    state.grounded,
    state.coyote,
    jumpPressed,
  );
  if (jump.jumped) {
    state.grounded = false;
    state.coyote = 0;
    state.airTime = 0;
    jumped = true;
  }

  // Attitude: track surface when near/on the shell.
  const regime = contactRegime(shell.altitude);
  if (state.grounded || regime === "planted") {
    blendUpToward(state, shell.normal, UP_TRACK, dt);
    boardAxes(state.yaw, state.up, _forward, _right);
  } else if (regime === "soft") {
    blendUpToward(state, shell.normal, UP_TRACK_SOFT, dt);
    boardAxes(state.yaw, state.up, _forward, _right);
  }

  return jumped;
}

/** Spawn / teleport altitude that sits just above the ride shell. */
export function shellSpawnAltitude(): number {
  return BOARD_CLEARANCE + SOFT_BAND * 0.25;
}

export function getSpeedRatio(speed: number): number {
  return THREE.MathUtils.clamp(speed / MAX_SPEED, 0, 1);
}
