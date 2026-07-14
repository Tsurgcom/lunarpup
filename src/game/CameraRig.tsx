import { useFrame, useThree } from "@react-three/fiber";
import { type RefObject, useEffect, useRef } from "react";
import * as THREE from "three";
import { boardAxes, getSpeedRatio, type PlayerState } from "./movement";
import { DEFAULT_PHYSICS, physics } from "./physicsTuning";

type CameraRigProps = {
  state: RefObject<PlayerState | null>;
};

const RENDER_PRIORITY = 0;

/** Board-frame chase — calm seat with flight / touchdown modulation. */
const LOOK_HEIGHT = 1.15;
const HEIGHT_BIAS = 0.85;

/** Soft position follow (frame-scaled). Lower = less involved. */
const CAM_LERP = 0.055;
const CAM_LERP_BOOST = 0.09;
const CAM_LERP_AIR = 0.042;

/** Seat distance / pitch ease (1/s). */
const SEAT_DRAG = 3.2;
const PITCH_DRAG = 2.8;

const ORBIT_SENS = 0.0045;
const ZOOM_SENS = 0.0012;
const MIN_PITCH = -0.15;
const MAX_PITCH = 1.05;
/** Ground seat pitch. */
const DEFAULT_PITCH = 0.34;

/** Air hang rises over this many seconds. */
const AIR_RISE = 0.65;

/**
 * How hard FOV changes dolly-compensate subject size (0 = none, 1 = exact).
 * Broadcast trickery: nearly the same pup size, background still breathes.
 * Air uses a bit more so high-speed hangs don't shrink the pup.
 */
const FOV_FRAME_GROUND = 0.82;
const FOV_FRAME_AIR = 0.96;

const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _chase = new THREE.Vector3();
const _target = new THREE.Vector3();
const _look = new THREE.Vector3();

function lerpAngle(a: number, b: number, t: number): number {
  const delta = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + delta * t;
}

/** Scale chase distance so angular subject size stays ~constant vs FOV. */
function fovFramingScale(
  fovDeg: number,
  refFovDeg: number,
  strength: number,
): number {
  const halfTan = (deg: number) =>
    Math.tan(THREE.MathUtils.degToRad(deg) * 0.5);
  const ref = Math.max(halfTan(refFovDeg), 1e-4);
  const cur = Math.max(halfTan(fovDeg), 1e-4);
  return THREE.MathUtils.lerp(1, ref / cur, strength);
}

/**
 * Calm third-person: soft chase, mild speed FOV with dolly framing
 * (pup stays nearly same size), mouse orbit/zoom, flight seat, touchdown shift-out.
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
      yaw.current -= dx * ORBIT_SENS;
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

    // Gentle auto-follow — only when skating, settles slowly behind the board.
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

    // —— Flight seat: raise / open FOV; distance dolly-compensates framing ——
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

    // FOV first so chase distance can dolly-compensate subject size.
    // Radical speed open; air still dials speed FOV down so hang FOV owns the beat.
    const speedRatio = getSpeedRatio(speed);
    const speedFovT = speedRatio ** 1.05 * (1 - airT * 0.45);
    let targetFov = THREE.MathUtils.lerp(
      physics.cameraBaseFov,
      physics.cameraMaxFov,
      speedFovT,
    );
    targetFov += physics.camAirFov * airT;
    targetFov += descentT * 4;
    targetFov += punch * physics.camLandFov;
    targetFov = THREE.MathUtils.clamp(targetFov, 42, 110);

    const fovK = 1 - (1 - physics.fovSmoothing) ** frameScale;
    if (!ready.current) {
      fov.current = physics.cameraBaseFov;
    } else {
      fov.current = THREE.MathUtils.lerp(fov.current, targetFov, fovK);
    }

    // Keep air framing tight: FOV does the drama, dolly holds pup size.
    // camAirDist is a small intentional offset (default ~0), not a pull-back.
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
    // Touchdown shift-out after compensation so the catch still reads bigger.
    wantDist += physics.camLandDist * punch;
    wantDist = THREE.MathUtils.clamp(
      wantDist,
      physics.cameraMinDist,
      physics.cameraMaxDist,
    );

    // Orbit pitch + air lift; tip down a touch on descent; pop on touchdown.
    let wantPitch = pitch.current + physics.camAirPitch * airT + punch * 0.07;
    wantPitch -= descentT * 0.12;
    wantPitch = THREE.MathUtils.clamp(wantPitch, MIN_PITCH, MAX_PITCH);

    const seatK = 1 - Math.exp(-SEAT_DRAG * dt);
    const pitchK = 1 - Math.exp(-PITCH_DRAG * dt);
    if (!ready.current) {
      seatDist.current = wantDist;
      seatPitch.current = wantPitch;
    } else {
      seatDist.current += (wantDist - seatDist.current) * seatK;
      seatPitch.current += (wantPitch - seatPitch.current) * pitchK;
    }

    const horiz = Math.cos(seatPitch.current) * seatDist.current;
    const vert = Math.sin(seatPitch.current) * seatDist.current + HEIGHT_BIAS;

    _target
      .copy(pos)
      .addScaledVector(_chase, horiz)
      .addScaledVector(s.up, vert);

    let baseLerp = CAM_LERP;
    if (s.boosting) baseLerp = CAM_LERP_BOOST;
    else if (!s.grounded) baseLerp = CAM_LERP_AIR;
    // Landing punch: briefly stiffer so the shift-out reads.
    if (punch > 0.15) baseLerp = Math.max(baseLerp, 0.1);
    const camK = 1 - (1 - baseLerp) ** frameScale;

    if (!ready.current) {
      smoothed.current.copy(_target);
      zoomDist.current = physics.cameraDistance;
      seatDist.current = wantDist;
      ready.current = true;
    } else {
      smoothed.current.lerp(_target, camK);
    }

    _look.copy(pos).addScaledVector(s.up, LOOK_HEIGHT);

    camera.position.copy(smoothed.current);
    camera.up.copy(s.up);
    camera.lookAt(_look);

    if (camera instanceof THREE.PerspectiveCamera) {
      if (Math.abs(camera.fov - fov.current) > 1e-3) {
        camera.fov = fov.current;
        camera.updateProjectionMatrix();
      }
    }
  }, RENDER_PRIORITY);

  return null;
}
