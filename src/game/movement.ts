import * as THREE from "three";
import { MAX_SPEED, SPAWN_DIR } from "./moon";
import { DEFAULT_PHYSICS, physics } from "./physicsTuning";
import {
  antiTunnel,
  applyRideShellField,
  contactRegime,
  createShellSample,
  plantOnShell,
  type RideShellSample,
  stickToShell,
  tryJump,
  updateContactState,
} from "./rideShell";

/** Visual lean amplitude (rad). Live: {@link physics}.leanAngle. */
export const LEAN_ANGLE = DEFAULT_PHYSICS.leanAngle;
/** Visual pitch amplitude (rad). Live: {@link physics}.pitchAngle. */
export const PITCH_ANGLE = DEFAULT_PHYSICS.pitchAngle;
/** Visual roll amplitude (rad). Shares pitch angle tuning. */
export const ROLL_ANGLE = DEFAULT_PHYSICS.pitchAngle;

/** Integrator mass (kg). Live: {@link physics}.mass. */
export const MASS = DEFAULT_PHYSICS.mass;

const SUBSTEPS = 6;

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
  rollLeft: boolean;
  rollRight: boolean;
  boosting: boolean;
  jump: boolean;
};

export type PlayerState = {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  yaw: number;
  lean: number;
  pitch: number;
  roll: number;
  /** Board up axis — tracks surface normal when planted. */
  up: THREE.Vector3;
  boosting: boolean;
  grounded: boolean;
  /** Continuous airborne time (s). */
  airTime: number;
  /** Remaining coyote window (s). */
  coyote: number;
  /** Remaining early-jump buffer (s) — v1 JUMP_BUFFER_MS. */
  jumpBuffer: number;
  /** Previous-frame Space held (rising-edge queue). */
  jumpHeld: boolean;
  /** Last contact normal (outward). */
  contactNormal: THREE.Vector3;
  /**
   * Brief touchdown impulse (0..~1.2) — camera shift-out + landing FX.
   * Set on re-plant after meaningful air; decays each step.
   */
  landingPunch: number;
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
  // Short drop-in above the local ride shell (respects crater floors).
  const pos = plantOnShell(SPAWN_DIR);
  pos.addScaledVector(SPAWN_DIR, physics.softBand * 0.35 + 1.6);
  const yaw = 0;
  boardAxes(yaw, up, _forward, _right);
  return {
    pos,
    vel: _forward.clone().multiplyScalar(2),
    yaw,
    lean: 0,
    pitch: 0,
    roll: 0,
    up,
    boosting: false,
    grounded: false,
    airTime: 0,
    coyote: 0,
    jumpBuffer: 0,
    jumpHeld: false,
    contactNormal: up.clone(),
    landingPunch: 0,
  };
}

/**
 * Ride-shell integrator: lunar radial field + contact plant, thrust / drag /
 * lean yaw, and free attitude pitch / roll while airborne.
 *
 * Arcade feel (v1): jump buffer, drift breakaway, slope slide, dual boost,
 * air steer grip / turn snappiness, air hover assist, landing catch.
 */
export function stepPlayer(
  state: PlayerState,
  input: ControlInput,
  dt: number,
): void {
  // Rising-edge Space queues a short buffer (v1 JUMP_BUFFER_MS).
  if (input.jump && !state.jumpHeld) {
    state.jumpBuffer = physics.jumpBuffer;
  }
  state.jumpHeld = input.jump;

  const step = dt / SUBSTEPS;
  let jumpConsumed = false;
  for (let i = 0; i < SUBSTEPS; i++) {
    const wantJump = state.jumpBuffer > 0 && !jumpConsumed;
    const didJump = substep(state, input, step, wantJump);
    if (didJump) {
      jumpConsumed = true;
      state.jumpBuffer = 0;
    } else if (state.jumpBuffer > 0) {
      state.jumpBuffer = Math.max(0, state.jumpBuffer - step);
    }
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
  const leanRate = leanTarget === 0 ? physics.leanRecover : physics.leanEngage;
  state.lean += (leanTarget - state.lean) * (1 - Math.exp(-leanRate * dt));
  if (Math.abs(state.lean) < 1e-4) state.lean = 0;

  const pitchTarget = (input.pitchUp ? 1 : 0) - (input.pitchDown ? 1 : 0);
  const pitchRate =
    pitchTarget === 0 ? physics.pitchRecover : physics.pitchEngage;
  state.pitch += (pitchTarget - state.pitch) * (1 - Math.exp(-pitchRate * dt));
  if (Math.abs(state.pitch) < 1e-4) state.pitch = 0;

  const rollTarget = (input.rollLeft ? 1 : 0) - (input.rollRight ? 1 : 0);
  const rollRate =
    rollTarget === 0 ? physics.pitchRecover : physics.pitchEngage;
  state.roll += (rollTarget - state.roll) * (1 - Math.exp(-rollRate * dt));
  if (Math.abs(state.roll) < 1e-4) state.roll = 0;

  const speed = state.vel.length();
  const steer = physics.steerRate / (1 + speed / physics.steerSpeedHalf);
  const turnMult = state.grounded ? 1 : physics.airTurnMult;
  state.yaw += state.lean * steer * turnMult * dt;
  boardAxes(state.yaw, state.up, _forward, _right);

  // R/F pitches the board about the lateral axis only while airborne.
  if (!state.grounded && Math.abs(state.pitch) > 1e-4) {
    const dPitch = -state.pitch * physics.pitchRate * dt;
    _prevFwd.copy(_forward);
    state.up.applyAxisAngle(_right, dPitch).normalize();
    _prevFwd.applyAxisAngle(_right, dPitch).normalize();
    retargetYaw(state, state.up, _prevFwd);
    boardAxes(state.yaw, state.up, _forward, _right);
  }

  // Q/E rolls the board about the forward axis only while airborne.
  if (!state.grounded && Math.abs(state.roll) > 1e-4) {
    const dRoll = state.roll * physics.pitchRate * dt;
    state.up.applyAxisAngle(_forward, dRoll).normalize();
    retargetYaw(state, state.up, _forward);
    boardAxes(state.yaw, state.up, _forward, _right);
  }

  _force.set(0, 0, 0);

  let axis = 0;
  if (input.forward) axis += 1;
  if (input.back) axis -= physics.reverseMult;
  if (axis !== 0) {
    // Airborne thrust — v1 airThrustMultiplier (baseline 0.82).
    const airFade = state.grounded ? 1 : physics.airThrustFade;
    const boostAccel = input.boosting ? physics.boostAccelMult : 1;
    const thrust = physics.thrust * boostAccel * airFade;
    _force.addScaledVector(_forward, axis * thrust);
  }

  const coast = state.grounded ? physics.coastFriction : physics.airCoast;
  if (speed > 1e-4) {
    _force.addScaledVector(state.vel, -physics.drag * speed);
    _force.addScaledVector(state.vel, -coast);
  }

  // Lateral grip when planted — breaks into drift past threshold (v1).
  if (state.grounded) {
    const vLat = state.vel.dot(_right);
    const absLat = Math.abs(vLat);
    if (absLat > 1e-4) {
      let grip = physics.lateralGrip;
      if (absLat > physics.driftThreshold) {
        grip *= physics.driftGripMult;
      }
      _force.addScaledVector(_right, -vLat * physics.mass * grip);
    }
  } else if (physics.airSteerGrip > 0) {
    // Pull lateral velocity toward board heading (v1 airSteerGrip).
    const vLat = state.vel.dot(_right);
    if (Math.abs(vLat) > 1e-4) {
      _force.addScaledVector(
        _right,
        -vLat * physics.mass * physics.airSteerGrip,
      );
    }
  }

  state.vel.addScaledVector(_force, dt / physics.mass);

  // Ride-shell gravity + contact support (+ slope slide / air hover assist).
  const shell = shellScratch();
  applyRideShellField(
    state.pos,
    state.vel,
    physics.mass,
    dt,
    shell,
    state.grounded,
  );
  state.contactNormal.copy(shell.normal);

  // Dual boost: top-speed cap rises while boosting (v1 boostMultiplier).
  const speedCap = physics.maxSpeed * (input.boosting ? physics.boostMult : 1);
  const spd = state.vel.length();
  if (spd > speedCap) {
    state.vel.multiplyScalar(speedCap / spd);
  }

  state.pos.addScaledVector(state.vel, dt);
  antiTunnel(state.pos, state.vel, shell);

  const wasAirborne = !state.grounded;
  const airBefore = state.airTime;

  if (stickToShell(state.pos, state.vel, state.grounded, shell)) {
    state.grounded = true;
    state.airTime = 0;
    state.coyote = physics.coyoteTime;
  }
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

  // Touchdown punch after a real air — camera shift-out + landing FX.
  if (wasAirborne && state.grounded && airBefore > 0.08) {
    state.landingPunch = Math.min(1.2, 0.32 + airBefore * 0.55);
  }
  if (state.landingPunch > 0) {
    state.landingPunch = Math.max(0, state.landingPunch - dt * 3.4);
  }

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
    blendUpToward(state, shell.normal, physics.upTrack, dt);
    boardAxes(state.yaw, state.up, _forward, _right);
  } else if (regime === "soft") {
    blendUpToward(state, shell.normal, physics.upTrackSoft, dt);
    boardAxes(state.yaw, state.up, _forward, _right);
  }

  return jumped;
}

/** Spawn / teleport altitude that sits just above the ride shell. */
export function shellSpawnAltitude(): number {
  return physics.boardClearance + physics.softBand * 0.25;
}

/**
 * Speed ratio for FOV / speed lines — uses boosted top speed as the 1.0 mark
 * (v1 getSpeedRatio with maxSpeed * boostMultiplier).
 */
export function getSpeedRatio(speed: number): number {
  const hudFast = physics.maxSpeed * physics.boostMult;
  if (hudFast <= 0) return 0;
  return THREE.MathUtils.clamp(Math.abs(speed) / hudFast, 0, 1);
}
