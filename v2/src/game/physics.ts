import * as THREE from "three";
import {
  MOON_RADIUS,
  SPAWN_DIR,
  sampleContactHeightDir,
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
export const BOARD_CLEARANCE = 0.36;

/**
 * Hoverboard spring (N/m). Holds the deck near BOARD_CLEARANCE without
 * hard positional snaps that chatter on slope changes.
 */
export const HOVER_STIFFNESS = 1600;

/** Hover damper (N·s/m) — near-critical for MASS/HOVER_STIFFNESS. */
export const HOVER_DAMPING = 320;

/**
 * Still "on deck" within this height above clearance (m). Beyond it the
 * board goes ballistic — no coyote sticky, just a soft hover envelope.
 */
export const HOVER_BAND = 0.62;

/**
 * Only tunnel this deep before a soft positional push (m below clearance).
 * Normal riding never hits this — spring handles ordinary contact.
 */
export const HOVER_SNAP_DEPTH = 0.4;

/** How fast grounded board normals follow the terrain (1/s). */
export const NORMAL_FOLLOW = 14;

/** Separating speed (m/s) that breaks hover without an ollie. */
export const HOVER_TAKEOFF_VN = 3.2;

/** Peak push force during a stroke (N) — ground only. */
export const PUSH_FORCE = 118;

/** Active stroke duration while W is held (s). */
export const PUSH_STROKE = 0.3;

/** Coast between strokes while W is held (s). */
export const PUSH_GAP = 0.4;

/** Board jetpack thrust along local forward (N). */
export const JETPACK_FORCE = 95;

/** Seconds of continuous jetpack thrust at full fuel. */
export const JET_FUEL_MAX = 2.2;

/** Fuel recharge rate while grounded and not thrusting (1/s). */
export const JET_RECHARGE = 0.7;

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

/**
 * Coefficient of restitution on hard landings from air only.
 * Soft hover contact is spring-damper — never bounce while seated.
 */
export const RESTITUTION = 0.08;

/** Impact speed (m/s into deck) above which restitution applies on first touch. */
export const RESTITUTION_SPEED = 3.5;

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
  /** F — nose up / weight back. */
  pitchUp: boolean;
  /** R — nose down / weight forward. */
  pitchDown: boolean;
  jump: boolean;
  /** Hold Shift — thrust along board forward/back with W/S (works in vacuum). */
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
   * Continuous nose pitch in [-1, 1]. Positive = nose up (F).
   * Visual on ground; rotates attitude while airborne.
   */
  pitch: number;
  grounded: boolean;
  /** Surface normal — updated on contact, held inertial while airborne. */
  normal: THREE.Vector3;
  normalForce: number;
  /**
   * Push stroke clock (s). >0 = thrusting; <0 = recovering; 0 = ready.
   * Cycles automatically while W is held on the ground.
   */
  pushTimer: number;
  /** True while the current frame is inside an active push stroke. */
  pushing: boolean;
  /** Jetpack fuel remaining (s of thrust). */
  jetFuel: number;
  /** Seconds continuously airborne (0 while grounded). */
  airTime: number;
  /**
   * Landing impulse for camera/feel — set on touchdown, decays to 0.
   * Magnitude ≈ airTime at impact (capped).
   */
  landingPunch: number;
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
    pushTimer: 0,
    pushing: false,
    jetFuel: JET_FUEL_MAX,
    airTime: 0,
    landingPunch: 0,
  };
}

/**
 * Semi-implicit Euler with inverse-square gravity and hoverboard contact.
 * Grounded riding uses a spring-damper (no hard surface snap); high-speed
 * paths go ballistic over crevices; circular orbit is reachable above the
 * atmosphere.
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
  // Soft-follow crust normal while grounded so slope changes don't jerk yaw.
  boardAxes(body.yaw, body.normal, _prevFwd, _right);
  if (body.grounded) {
    sampleNormalAtSafe(body.pos, _n);
    const follow = 1 - Math.exp(-NORMAL_FOLLOW * dt);
    body.normal.lerp(_n, follow).normalize();
    retargetYaw(body, body.normal, _prevFwd);
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

  // Smooth pitch: F = nose up, R = nose down.
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

  // Height above crust gates wheel thrust + hover spring.
  const h0 = sampleContactHeightDir(_radial);
  sampleNormalDir(_radial, _n, 0.7, h0);
  _surface.copy(_radial).multiplyScalar(MOON_RADIUS + h0);
  const alt = heightAbove(_surface, _n, body.pos);
  const nearGround = body.grounded || alt < BOARD_CLEARANCE + NEAR_GROUND;
  const inHover =
    !jumpUsed &&
    alt < BOARD_CLEARANCE + HOVER_BAND &&
    (body.grounded || alt < BOARD_CLEARANCE + HOVER_BAND * 0.55);

  // Gravity toward the moon center. On the deck, drop the tangential part so
  // radial pull can't drain the pup into crater bowls — only the into-board
  // component remains. Airborne keeps full CoM gravity for orbits.
  const g = gravityAccel(r);
  _force.copy(_radial).multiplyScalar(-MASS * g);
  const supportN = body.grounded ? n : _n;
  if (body.grounded || inHover) {
    const intoDeck = _force.dot(supportN);
    _force.copy(supportN).multiplyScalar(intoDeck);
  }

  // Hover spring-damper: float at clearance; preload cancels 1g into-deck.
  if (inHover) {
    const vnHover = body.vel.dot(supportN);
    const err = BOARD_CLEARANCE - alt;
    const hoverF =
      MASS * g + HOVER_STIFFNESS * err - HOVER_DAMPING * vnHover;
    _force.addScaledVector(supportN, hoverF);
    body.normalForce = Math.max(0, hoverF);
  }

  // Wheel push — pulsed strokes while W is held (on / very near the crust).
  body.pushing = false;
  if (!nearGround || !input.forward) {
    body.pushTimer = 0;
  } else if (body.pushTimer < 0) {
    body.pushTimer = Math.min(0, body.pushTimer + dt);
  } else if (body.pushTimer === 0) {
    body.pushTimer = PUSH_STROKE;
  }
  if (nearGround && input.forward && body.pushTimer > 0) {
    _long.copy(_forward).addScaledVector(n, -_forward.dot(n));
    if (_long.lengthSq() > 1e-8) {
      _long.normalize();
      _force.addScaledVector(_long, PUSH_FORCE);
      body.pushing = true;
    }
    body.pushTimer -= dt;
    if (body.pushTimer <= 0) body.pushTimer = -PUSH_GAP;
  }

  // Jetpack: Shift + W/S along board forward/back (Shift alone = forward).
  // Fuel drains in vacuum thrust; recharges on the deck when not firing.
  let jetting = false;
  if (input.jetpack && body.jetFuel > 0) {
    let axis = 0;
    if (input.forward) axis += 1;
    if (input.back) axis -= 1;
    if (axis === 0) axis = 1;
    _long.copy(_forward).addScaledVector(n, -_forward.dot(n));
    if (_long.lengthSq() > 1e-8) {
      _long.normalize();
      _force.addScaledVector(_long, axis * JETPACK_FORCE);
      jetting = true;
    }
  }
  if (jetting) {
    body.jetFuel = Math.max(0, body.jetFuel - dt);
  } else if (body.grounded) {
    body.jetFuel = Math.min(JET_FUEL_MAX, body.jetFuel + JET_RECHARGE * dt);
  }

  // Landing punch decays every substep; air clock updates after contact.
  if (body.landingPunch > 0) {
    body.landingPunch = Math.max(0, body.landingPunch - dt * 3.5);
  }

  const speed = body.vel.length();
  const rho = atmosphereDensity(r);
  if (speed > 1e-4 && rho > 1e-4) {
    _force.addScaledVector(body.vel, -AIR_DRAG * rho * speed);
  }

  if (body.grounded || inHover) {
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

    const muLat = nearGround && body.pushing ? MU_LATERAL_PUSH : MU_LATERAL;
    const vLat = body.vel.dot(_right);
    if (Math.abs(vLat) > 1e-4) {
      const maxLat = muLat * N;
      // Softer than a hard kill — stiff grip felt snappy/sticky on slides.
      const latForce = THREE.MathUtils.clamp(
        -vLat * MASS * 8,
        -maxLat,
        maxLat,
      );
      _force.addScaledVector(_right, latForce);
    }
  }

  _accel.copy(_force).multiplyScalar(1 / MASS);
  body.vel.addScaledVector(_accel, dt);
  body.pos.addScaledVector(body.vel, dt);

  // Re-sample crust under the new position.
  const r2 = Math.max(body.pos.length(), 1e-4);
  _radial.copy(body.pos).multiplyScalar(1 / r2);
  const h = sampleContactHeightDir(_radial);
  sampleNormalDir(_radial, _n, 0.7, h);
  _surface.copy(_radial).multiplyScalar(MOON_RADIUS + h);

  const height = heightAbove(_surface, _n, body.pos);
  const wantJump = input.jump && !jumpUsed;
  const vnProbe = body.vel.dot(_n);

  // Soft tunnel escape only — ordinary riding never snaps onto the crust.
  if (height < BOARD_CLEARANCE - HOVER_SNAP_DEPTH) {
    const push = BOARD_CLEARANCE - HOVER_SNAP_DEPTH - height;
    body.pos.addScaledVector(_n, push);
    if (vnProbe < 0) body.vel.addScaledVector(_n, -vnProbe);
  }

  const seated =
    !jumpUsed &&
    height < BOARD_CLEARANCE + HOVER_BAND &&
    vnProbe < HOVER_TAKEOFF_VN;

  if (seated) {
    boardAxes(body.yaw, body.normal, _prevFwd, _right);
    // Blend toward fresh normal — avoid instant attitude snaps on slope joins.
    const follow = 1 - Math.exp(-NORMAL_FOLLOW * dt);
    body.normal.lerp(_n, follow).normalize();
    retargetYaw(body, body.normal, _prevFwd);

    // Hard-landing cushion from air (spring already supports soft rides).
    if (!body.grounded && vnProbe < -RESTITUTION_SPEED) {
      const e = RESTITUTION;
      const jn = -(1 + e) * MASS * vnProbe;
      body.vel.addScaledVector(body.normal, jn / MASS);
    }

    if (!body.grounded && body.airTime > 0.05) {
      body.landingPunch = Math.min(1.2, 0.35 + body.airTime * 0.55);
    }
    body.grounded = true;
    body.airTime = 0;

    if (wantJump && body.vel.length() > 0.35) {
      body.vel.addScaledVector(body.normal, OLLIE_IMPULSE / MASS);
      body.grounded = false;
      body.normalForce = 0;
      body.airTime = 0;
      return true;
    }
  } else {
    body.grounded = false;
    body.normalForce = 0;
    body.airTime += dt;
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
