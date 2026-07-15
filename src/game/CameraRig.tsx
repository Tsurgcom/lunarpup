import { useFrame, useThree } from "@react-three/fiber";
import { type RefObject, useEffect, useRef } from "react";
import * as THREE from "three";
import { boardAxes, getSpeedRatio, type PlayerState } from "./movement";
import { DEFAULT_PHYSICS, physics } from "./physicsTuning";

type CameraRigProps = {
  state: RefObject<PlayerState | null>;
};

const RENDER_PRIORITY = 0;

const LOOK_HEIGHT = 1.15;
const HEIGHT_BIAS = 0.85;

/** Soft position follow (frame-scaled). Lower = less involved. */
const CAM_LERP = 0.055;
const CAM_LERP_BOOST = 0.09;
const CAM_LERP_AIR = 0.042;

/** Seat distance / pitch / look / bank ease (1/s). */
const SEAT_DRAG = 3.2;
const PITCH_DRAG = 2.8;
const LOOK_DRAG = 5.5;
/** Snappy bank so the horizon tips with the pup lean, then recovers. */
const BANK_DRAG = 6.5;

const ORBIT_SENS = 0.0045;
const ZOOM_SENS = 0.0012;
const MIN_PITCH = -0.15;
const MAX_PITCH = 1.05;
const DEFAULT_PITCH = 0.34;

const AIR_RISE = 0.65;

/**
 * How hard FOV changes dolly-compensate subject size (0 = none, 1 = exact).
 * Broadcast trickery: nearly the same pup size, background still breathes.
 */
const FOV_FRAME_GROUND = 0.82;
const FOV_FRAME_AIR = 0.96;
const FOV_MIN = 42;
const FOV_MAX = 112;

const LOOK_AHEAD = 2.4;
const LOOK_AHEAD_AIR = 1.35;
const LOOK_VEL = 0.14;
const LOOK_VEL_MAX = 1.8;

/**
 * Slight dutch bank from A/D lean (rad at full lean). Mirrors the pup tip;
 * recovers when lean returns to zero. Kick is a brief overshoot on engage.
 */
const BANK_AMP = 0.1;
const BANK_KICK = 0.055;
const BANK_KICK_DECAY = 4.2;
const LEAN_SWAY = 0.55;

const BOOST_FOV = 5.5;
const BOOST_PUNCH_DECAY = 4.5;
const BOOST_FOV_KICK = 7;
const BOOST_DIST_KICK = 0.55;

/** Landing swell — hotter than physics punch, ~500ms ease in/out. */
const LAND_INTENSITY = 1.35;
const LAND_RISE = 0.5;
const LAND_FALL = 0.5;
const SHAKE_AMP = 0.16;
const SHAKE_FREQ_A = 11;
const SHAKE_FREQ_B = 17.5;
const LAND_BOOM = 0.72;
const LAND_PITCH = 0.1;

/**
 * Continuous high-speed tremor. HUD uses ×10, so 50 m/s = 500 U/S —
 * above cruise (400) and into boost overspeed. Quadratic ease: soft
 * onset, punches near the boosted hard cap. Waveform is jagged value
 * noise (not a sine) so it reads as vibration, not a pulse.
 */
const SPEED_SHAKE_START = 50;
const SPEED_SHAKE_AMP = 0.22;
/** Noise cells per second — higher = buzzier / less wavy. */
const SPEED_SHAKE_RATE_A = 48;
const SPEED_SHAKE_RATE_B = 67;

/**
 * Post-landing hero seat — grounded skate after touchdown dollies in so the
 * pup reads ~4× larger (distance × 1/4).
 */
const HERO_SIZE = 4;
const HERO_EASE = 0.5;
const HERO_MIN_DIST = 1.15;

const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _chase = new THREE.Vector3();
const _target = new THREE.Vector3();
const _look = new THREE.Vector3();
const _lookWant = new THREE.Vector3();
const _velT = new THREE.Vector3();
const _bankedUp = new THREE.Vector3();

function lerpAngle(a: number, b: number, t: number): number {
  const delta = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + delta * t;
}

function expK(drag: number, dt: number): number {
  return 1 - Math.exp(-drag * dt);
}

/** Deterministic hash → [-1, 1]. */
function hash11(n: number): number {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

/**
 * Jagged 1D value noise — linear cell lerp (no smoothstep) so edges stay
 * sharp. Two octaves keep it from looking like a single square wave.
 */
function jaggedNoise(t: number, seed: number): number {
  const i = Math.floor(t);
  const f = t - i;
  const a = hash11(i + seed);
  const b = hash11(i + 1 + seed);
  const base = a + (b - a) * f;
  const j = Math.floor(t * 2.37 + seed * 0.13);
  const g = t * 2.37 - Math.floor(t * 2.37);
  const c = hash11(j + seed * 3.1);
  const d = hash11(j + 1 + seed * 3.1);
  return base * 0.72 + (c + (d - c) * g) * 0.28;
}

function halfTanDeg(deg: number): number {
  return Math.tan(THREE.MathUtils.degToRad(deg) * 0.5);
}

/** Scale chase distance so angular subject size stays ~constant vs FOV. */
function fovFramingScale(
  fovDeg: number,
  refFovDeg: number,
  strength: number,
): number {
  const ref = Math.max(halfTanDeg(refFovDeg), 1e-4);
  const cur = Math.max(halfTanDeg(fovDeg), 1e-4);
  return THREE.MathUtils.lerp(1, ref / cur, strength);
}

/** Rise then fall envelope in [0,1] for a timed camera swell. */
function swellEnv(t: number, rise: number, fall: number): number {
  return (
    THREE.MathUtils.smoothstep(0, rise, t) *
    (1 - THREE.MathUtils.smoothstep(rise, rise + fall, t))
  );
}

/**
 * Third-person chase with FOV/dolly framing plus lean bank, look-ahead,
 * turn sway, boost kick, high-speed tremor, and touchdown shake / boom.
 */
export function CameraRig({ state }: CameraRigProps) {
  const { camera, gl } = useThree();
  const yaw = useRef(0);
  const pitch = useRef(DEFAULT_PITCH);
  /** Player wheel zoom — flight offsets layer on top. */
  const zoomDist = useRef<number>(DEFAULT_PHYSICS.cameraDistance);
  const seatDist = useRef<number>(DEFAULT_PHYSICS.cameraDistance);
  const seatPitch = useRef(DEFAULT_PITCH);
  const dragging = useRef(false);
  const lastPointer = useRef({ x: 0, y: 0 });
  const ready = useRef(false);
  const smoothed = useRef(new THREE.Vector3());
  const fov = useRef<number>(DEFAULT_PHYSICS.cameraBaseFov);
  const lookOff = useRef(new THREE.Vector3());
  const bank = useRef(0);
  const bankKick = useRef(0);
  const prevLean = useRef(0);
  const shakeT = useRef(0);
  const boostPunch = useRef(0);
  const wasBoosting = useRef(false);
  /** Rising edge of landingPunch starts the swell + arms hero. */
  const prevPunch = useRef(0);
  const landPeak = useRef(0);
  const landAge = useRef(99);
  /** Armed after touchdown until the next air. */
  const heroArmed = useRef(false);
  const hero = useRef(0);

  useEffect(() => {
    const el = gl.domElement;
    el.style.touchAction = "none";

    const preventMenu = (e: Event) => e.preventDefault();

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      dragging.current = true;
      lastPointer.current = { x: e.clientX, y: e.clientY };
      el.setPointerCapture(e.pointerId);
    };

    const onMove = (e: PointerEvent) => {
      if (!dragging.current) return;
      const dx = e.clientX - lastPointer.current.x;
      const dy = e.clientY - lastPointer.current.y;
      lastPointer.current = { x: e.clientX, y: e.clientY };
      yaw.current += dx * ORBIT_SENS;
      pitch.current = THREE.MathUtils.clamp(
        pitch.current - dy * ORBIT_SENS,
        MIN_PITCH,
        MAX_PITCH,
      );
    };

    const onUp = (e: PointerEvent) => {
      dragging.current = false;
      if (el.hasPointerCapture(e.pointerId)) {
        el.releasePointerCapture(e.pointerId);
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const zoom = 1 + e.deltaY * ZOOM_SENS;
      zoomDist.current = THREE.MathUtils.clamp(
        zoomDist.current * zoom,
        physics.cameraMinDist,
        physics.cameraMaxDist,
      );
    };

    el.addEventListener("contextmenu", preventMenu);
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("contextmenu", preventMenu);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      el.removeEventListener("wheel", onWheel);
    };
  }, [gl]);

  useFrame((_, rawDt) => {
    const s = state.current;
    if (!s) return;

    const pos = s.pos;
    if (!Number.isFinite(pos.x) || pos.lengthSq() < 1) return;

    const dt = Math.min(rawDt, 0.05);
    const frameScale = dt * 60;
    const speed = s.vel.length();
    const punch = s.landingPunch;
    const speedRatio = getSpeedRatio(speed);

    if (punch > prevPunch.current + 0.04) {
      landPeak.current = Math.max(landPeak.current, punch * LAND_INTENSITY);
      landAge.current = 0;
      heroArmed.current = true;
    }
    prevPunch.current = punch;
    landAge.current += dt;

    let land = 0;
    if (landPeak.current > 1e-4) {
      const landEnv = swellEnv(landAge.current, LAND_RISE, LAND_FALL);
      if (landEnv < 1e-3 && landAge.current > LAND_RISE) {
        landPeak.current = 0;
      } else {
        land = landPeak.current * landEnv;
      }
    }

    if (!s.grounded) heroArmed.current = false;
    const wantHero = heroArmed.current && speed > physics.followSpeed ? 1 : 0;
    const heroStep = dt / HERO_EASE;
    hero.current = THREE.MathUtils.clamp(
      hero.current + (wantHero ? heroStep : -heroStep),
      0,
      1,
    );
    const heroT = THREE.MathUtils.smoothstep(0, 1, hero.current);

    if (s.boosting && !wasBoosting.current) boostPunch.current = 1;
    wasBoosting.current = s.boosting;
    if (boostPunch.current > 0) {
      boostPunch.current = Math.max(
        0,
        boostPunch.current - BOOST_PUNCH_DECAY * dt,
      );
    }

    if (!dragging.current && speed > physics.followSpeed) {
      const followK = 1 - (1 - physics.autoFollow) ** frameScale;
      yaw.current = lerpAngle(yaw.current, 0, followK);
    }

    boardAxes(s.yaw, s.up, _forward, _right);
    const cy = Math.cos(yaw.current);
    const sy = Math.sin(yaw.current);
    _chase
      .copy(_forward)
      .multiplyScalar(-cy)
      .addScaledVector(_right, sy)
      .normalize();

    const airT = s.grounded
      ? 0
      : THREE.MathUtils.clamp(s.airTime / AIR_RISE, 0, 1);
    const vN = s.vel.dot(s.up);
    const descentT =
      !s.grounded && vN < 0 ? THREE.MathUtils.clamp(-vN / 10, 0, 1) * airT : 0;

    zoomDist.current = THREE.MathUtils.clamp(
      zoomDist.current,
      physics.cameraMinDist,
      physics.cameraMaxDist,
    );

    // Land FOV applied after smoothing so the 500ms swell timing stays exact.
    const speedFovT = speedRatio ** 1.05 * (1 - airT * 0.45);
    let targetFov = THREE.MathUtils.lerp(
      physics.cameraBaseFov,
      physics.cameraMaxFov,
      speedFovT,
    );
    targetFov += physics.camAirFov * airT;
    targetFov += descentT * 4;
    if (s.boosting) targetFov += BOOST_FOV * (0.55 + 0.45 * speedRatio);
    targetFov += boostPunch.current * BOOST_FOV_KICK;
    targetFov = THREE.MathUtils.clamp(targetFov, FOV_MIN, FOV_MAX);

    const fovK = 1 - (1 - physics.fovSmoothing) ** frameScale;
    if (!ready.current) {
      fov.current = physics.cameraBaseFov;
    } else {
      fov.current = THREE.MathUtils.lerp(fov.current, targetFov, fovK);
    }

    let wantDist = zoomDist.current + physics.camAirDist * airT;
    const frameStrength = THREE.MathUtils.lerp(
      FOV_FRAME_GROUND,
      FOV_FRAME_AIR,
      airT,
    );
    wantDist *= fovFramingScale(
      fov.current,
      physics.cameraBaseFov,
      frameStrength,
    );
    wantDist += boostPunch.current * BOOST_DIST_KICK;
    wantDist = THREE.MathUtils.clamp(
      wantDist,
      physics.cameraMinDist,
      physics.cameraMaxDist,
    );

    // Land pitch/dist/boom ride the swell envelope directly (no seat lag).
    let wantPitch = pitch.current + physics.camAirPitch * airT;
    wantPitch -= descentT * 0.12;
    wantPitch = THREE.MathUtils.clamp(wantPitch, MIN_PITCH, MAX_PITCH);

    const seatK = expK(SEAT_DRAG, dt);
    const pitchK = expK(PITCH_DRAG, dt);
    if (!ready.current) {
      seatDist.current = wantDist;
      seatPitch.current = wantPitch;
    } else {
      seatDist.current += (wantDist - seatDist.current) * seatK;
      seatPitch.current += (wantPitch - seatPitch.current) * pitchK;
    }

    const landDist = physics.camLandDist * land * (1 - heroT);
    const displayPitch = THREE.MathUtils.clamp(
      seatPitch.current + land * LAND_PITCH,
      MIN_PITCH,
      MAX_PITCH,
    );
    const heroScale = THREE.MathUtils.lerp(1, 1 / HERO_SIZE, heroT);
    const displayDist = Math.max(
      HERO_MIN_DIST,
      (seatDist.current + landDist) * heroScale,
    );

    const horiz = Math.cos(displayPitch) * displayDist;
    const vert =
      Math.sin(displayPitch) * displayDist + HEIGHT_BIAS + land * LAND_BOOM;
    const sway =
      -s.lean * LEAN_SWAY * (0.35 + 0.65 * speedRatio) * (1 - airT * 0.4);

    _target
      .copy(pos)
      .addScaledVector(_chase, horiz)
      .addScaledVector(s.up, vert)
      .addScaledVector(_right, sway);

    let baseLerp = CAM_LERP;
    if (s.boosting) baseLerp = CAM_LERP_BOOST;
    else if (!s.grounded) baseLerp = CAM_LERP_AIR;
    if (boostPunch.current > 0.2) baseLerp = Math.max(baseLerp, 0.12);
    const camK = 1 - (1 - baseLerp) ** frameScale;

    _velT.copy(s.vel).addScaledVector(s.up, -s.vel.dot(s.up));
    const tangSpeed = _velT.length();
    if (tangSpeed > 1e-4) {
      _velT.multiplyScalar(
        Math.min(LOOK_VEL_MAX, tangSpeed * LOOK_VEL) / tangSpeed,
      );
    } else {
      _velT.set(0, 0, 0);
    }
    const ahead =
      THREE.MathUtils.lerp(LOOK_AHEAD, LOOK_AHEAD_AIR, airT) * speedRatio;
    _lookWant
      .copy(pos)
      .addScaledVector(s.up, LOOK_HEIGHT)
      .addScaledVector(_forward, ahead)
      .add(_velT)
      .sub(pos);

    if (!ready.current) {
      smoothed.current.copy(_target);
      lookOff.current.copy(_lookWant);
      zoomDist.current = physics.cameraDistance;
      seatDist.current = wantDist;
      ready.current = true;
    } else {
      smoothed.current.lerp(_target, camK);
      lookOff.current.lerp(_lookWant, expK(LOOK_DRAG, dt));
    }
    _look.copy(pos).add(lookOff.current);

    // A/D lean bank — tips with the pup, brief kick on engage, recovers on release.
    const dLean = s.lean - prevLean.current;
    prevLean.current = s.lean;
    if (dLean * s.lean > 0) {
      bankKick.current += dLean * BANK_KICK * 6;
      bankKick.current = THREE.MathUtils.clamp(
        bankKick.current,
        -BANK_KICK,
        BANK_KICK,
      );
    }
    bankKick.current *= Math.exp(-BANK_KICK_DECAY * dt);

    const wantBank = (s.lean * BANK_AMP + bankKick.current) * (1 - airT * 0.4);
    bank.current += (wantBank - bank.current) * expK(BANK_DRAG, dt);
    _bankedUp.copy(s.up).addScaledVector(_right, bank.current).normalize();

    camera.position.copy(smoothed.current);

    // Speed tremor: remap [500 U/S → boosted top] through t² so it stays
    // quiet just past threshold and ramps hard at peak overspeed.
    const hardCap = physics.maxSpeed * physics.boostMult;
    const speedSpan = Math.max(hardCap - SPEED_SHAKE_START, 1);
    const speedT = THREE.MathUtils.clamp(
      (speed - SPEED_SHAKE_START) / speedSpan,
      0,
      1,
    );
    const speedShake = speedT * speedT;
    const landAmp = land > 0.03 ? land * SHAKE_AMP : 0;
    const speedAmp = speedShake * SPEED_SHAKE_AMP;

    if (landAmp > 1e-4 || speedAmp > 1e-4) {
      shakeT.current += dt;
      const t = shakeT.current;
      // Landing stays sinusoidal (punch read); speed uses jagged noise.
      if (landAmp > 1e-4) {
        camera.position
          .addScaledVector(_right, Math.sin(t * SHAKE_FREQ_A) * landAmp)
          .addScaledVector(
            s.up,
            Math.sin(t * SHAKE_FREQ_B + 1.7) * landAmp * 0.45,
          );
      }
      if (speedAmp > 1e-4) {
        camera.position
          .addScaledVector(
            _right,
            jaggedNoise(t * SPEED_SHAKE_RATE_A, 1.7) * speedAmp,
          )
          .addScaledVector(
            s.up,
            jaggedNoise(t * SPEED_SHAKE_RATE_B, 4.2) * speedAmp * 0.55,
          );
      }
    } else {
      shakeT.current = 0;
    }

    camera.up.copy(_bankedUp);
    camera.lookAt(_look);

    if (camera instanceof THREE.PerspectiveCamera) {
      const displayFov = THREE.MathUtils.clamp(
        fov.current + land * physics.camLandFov,
        FOV_MIN,
        FOV_MAX,
      );
      if (Math.abs(camera.fov - displayFov) > 1e-3) {
        camera.fov = displayFov;
        camera.updateProjectionMatrix();
      }
    }
  }, RENDER_PRIORITY);

  return null;
}
