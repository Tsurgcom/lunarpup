import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, type RefObject } from "react";
import * as THREE from "three";
import { boardAxes, type BodyState } from "./physics";
import { MOON_RADIUS, sampleContactHeightDir } from "./terrain";

type CameraRigProps = {
  body: RefObject<BodyState | null>;
  /** Interpolated mesh pose — keep the lens locked to what you see. */
  renderPos: RefObject<THREE.Vector3>;
};

/** After Player physics (-2) and LunarRocks (-1); before auto-render. */
const RENDER_PRIORITY = 0;

const CHASE_DIST = 8;
const CHASE_HEIGHT = 3.4;
const LOOK_HEIGHT = 1.1;
const LOOK_AHEAD = 2.5;
const LOOK_VEL_SCALE = 0.2;
const LOOK_VEL_MAX = 2;

/** Soft scalar follow (1/s). Lower = smoother, less twitchy. */
const DIST_DRAG = 4;
const BOOM_DRAG = 5;
const LOOK_DRAG = 6;
const CHASE_DRAG = 10;
const FOV_DRAG = 1.5;

/** Max rate of change for distance / boom (m/s) — kills snap in/out and up/down. */
const DIST_RATE = 6;
const BOOM_RATE = 4;
const CRUST_DIST_RATE = 5;
const CRUST_BOOM_RATE = 2.5;

const ORBIT_SENS = 0.0045;
const ORBIT_MAX_RATE = 2;
const MIN_PITCH = -0.22;
const MAX_PITCH = 0.65;
const MIN_CLEARANCE = 1.2;
const MAX_DIST = 11;
const MAX_BOOM = 6.5;

const FOV_MOVE = 68;
const FOV_IDLE = 71;
const FOV_AIR = 76;
const IDLE_SPEED = 1.2;
const AIR_FOV_RISE = 0.55;

const _radial = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _chaseWant = new THREE.Vector3();
const _chase = new THREE.Vector3();
const _pos = new THREE.Vector3();
const _look = new THREE.Vector3();
const _lookWant = new THREE.Vector3();
const _velT = new THREE.Vector3();
const _liftDir = new THREE.Vector3();
const _tmp = new THREE.Vector3();

/**
 * Arcade board-frame orbit with rate-limited distance/boom — no snap crust
 * resolves, so the lens doesn't jerk in/out or up/down over rims.
 */
export function CameraRig({ body, renderPos }: CameraRigProps) {
  const { camera, gl } = useThree();
  const wantYaw = useRef(0);
  const wantPitch = useRef(0.32);
  const orbitYaw = useRef(0);
  const orbitPitch = useRef(0.32);
  const dragging = useRef(false);
  const lastPointer = useRef({ x: 0, y: 0 });

  const dist = useRef(CHASE_DIST);
  const boomH = useRef(CHASE_HEIGHT + CHASE_DIST * Math.sin(0.32));
  const chase = useRef(new THREE.Vector3(0, 0, 1));
  const lookOff = useRef(new THREE.Vector3());
  const fov = useRef(FOV_MOVE);
  const ready = useRef(false);

  useEffect(() => {
    const el = gl.domElement;
    el.style.touchAction = "none";

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
      wantYaw.current -= dx * ORBIT_SENS;
      wantPitch.current = THREE.MathUtils.clamp(
        wantPitch.current + dy * ORBIT_SENS,
        MIN_PITCH,
        MAX_PITCH,
      );
    };

    const onUp = (e: PointerEvent) => {
      if (e.button !== 0 && e.type !== "pointercancel") return;
      dragging.current = false;
      if (el.hasPointerCapture(e.pointerId)) {
        el.releasePointerCapture(e.pointerId);
      }
    };

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
    };
  }, [gl]);

  useFrame((_, rawDt) => {
    const b = body.current;
    const anchor = renderPos.current;
    if (!b || !anchor) return;
    const dt = Math.min(rawDt, 0.05);

    orbitYaw.current = approachAngle(
      orbitYaw.current,
      wantYaw.current,
      ORBIT_MAX_RATE * dt,
    );
    orbitPitch.current = approachScalar(
      orbitPitch.current,
      wantPitch.current,
      ORBIT_MAX_RATE * dt,
    );

    _radial.copy(anchor).normalize();
    boardAxes(b.yaw, b.normal, _forward, _right);

    const cy = Math.cos(orbitYaw.current);
    const sy = Math.sin(orbitYaw.current);
    _chaseWant
      .copy(_forward)
      .multiplyScalar(cy)
      .addScaledVector(_right, sy);
    projectTangent(_chaseWant, _radial);

    if (!ready.current) {
      chase.current.copy(_chaseWant);
    } else {
      // Smooth chase axis so surface-normal chatter doesn't shake the seat.
      const ck = 1 - Math.exp(-CHASE_DRAG * dt);
      chase.current.lerp(_chaseWant, ck);
      projectTangent(chase.current, _radial);
    }
    _chase.copy(chase.current);

    const cosP = Math.cos(orbitPitch.current);
    const sinP = Math.sin(orbitPitch.current);
    const nominalDist = Math.max(3, CHASE_DIST * cosP);
    const nominalBoom = CHASE_HEIGHT + CHASE_DIST * sinP;

    // Probe crust at the nominal seat; ease dist/boom toward clearance — no snaps.
    _pos
      .copy(anchor)
      .addScaledVector(_chase, -dist.current)
      .addScaledVector(_radial, boomH.current);
    const pen = crustPenetration(_pos);

    let targetDist = nominalDist;
    let targetBoom = nominalBoom;
    if (pen > 0) {
      targetDist = Math.min(MAX_DIST, Math.max(nominalDist, dist.current + pen));
      targetBoom = Math.min(MAX_BOOM, Math.max(nominalBoom, boomH.current + pen * 0.2));
    }

    if (!ready.current) {
      dist.current = targetDist;
      boomH.current = targetBoom;
    } else {
      const distRate = pen > 0 ? CRUST_DIST_RATE : DIST_RATE;
      const boomRate = pen > 0 ? CRUST_BOOM_RATE : BOOM_RATE;
      dist.current = smoothScalar(
        dist.current,
        targetDist,
        DIST_DRAG,
        distRate,
        dt,
      );
      boomH.current = smoothScalar(
        boomH.current,
        targetBoom,
        BOOM_DRAG,
        boomRate,
        dt,
      );
    }
    dist.current = THREE.MathUtils.clamp(dist.current, 3, MAX_DIST);
    boomH.current = THREE.MathUtils.clamp(boomH.current, 1.5, MAX_BOOM);

    _pos
      .copy(anchor)
      .addScaledVector(_chase, -dist.current)
      .addScaledVector(_radial, boomH.current);

    // Last-resort clearance: tiny rate-limited radial nudge only (no teleport).
    const pen2 = crustPenetration(_pos);
    if (pen2 > 0) {
      const lift = Math.min(pen2, BOOM_RATE * dt);
      _pos.addScaledVector(_radial, lift);
      boomH.current = Math.min(MAX_BOOM, boomH.current + lift);
    }

    _velT.copy(b.vel).addScaledVector(_radial, -b.vel.dot(_radial));
    const speed = _velT.length();
    if (speed > 1e-4) {
      _velT.multiplyScalar(
        Math.min(LOOK_VEL_MAX, speed * LOOK_VEL_SCALE) / speed,
      );
    } else {
      _velT.set(0, 0, 0);
    }

    _lookWant
      .copy(anchor)
      .addScaledVector(_radial, LOOK_HEIGHT)
      .addScaledVector(_chase, LOOK_AHEAD)
      .add(_velT);

    if (!ready.current) {
      lookOff.current.copy(_lookWant).sub(anchor);
      fov.current = FOV_MOVE;
      ready.current = true;
    } else {
      _tmp.copy(_lookWant).sub(anchor);
      const lookK = 1 - Math.exp(-LOOK_DRAG * dt);
      lookOff.current.lerp(_tmp, lookK);

      const idleT = 1 - THREE.MathUtils.clamp(speed / IDLE_SPEED, 0, 1);
      let targetFov = THREE.MathUtils.lerp(FOV_MOVE, FOV_IDLE, idleT);
      if (!b.grounded) {
        const airT = THREE.MathUtils.clamp(b.airTime / AIR_FOV_RISE, 0, 1);
        targetFov = THREE.MathUtils.lerp(targetFov, FOV_AIR, airT);
      }
      // Brief widen on landing so the catch reads.
      targetFov += b.landingPunch * 3.2;
      const fovK = 1 - Math.exp(-FOV_DRAG * dt);
      fov.current += (targetFov - fov.current) * fovK;
    }

    // Soft boom lift on landing punch.
    if (b.landingPunch > 0.05) {
      boomH.current = Math.min(
        MAX_BOOM,
        boomH.current + b.landingPunch * 2.2 * dt,
      );
    }

    _look.copy(anchor).add(lookOff.current);

    camera.position.copy(_pos);
    camera.up.copy(_radial);
    camera.lookAt(_look);
    if (camera instanceof THREE.PerspectiveCamera) {
      if (Math.abs(camera.fov - fov.current) > 0.05) {
        camera.fov = fov.current;
        camera.updateProjectionMatrix();
      }
    }
  }, RENDER_PRIORITY);

  return null;
}

/** Exp approach with a hard rate cap (m/s). */
function smoothScalar(
  current: number,
  target: number,
  drag: number,
  maxRate: number,
  dt: number,
): number {
  const k = 1 - Math.exp(-drag * dt);
  const next = current + (target - current) * k;
  return approachScalar(current, next, maxRate * dt);
}

function projectTangent(v: THREE.Vector3, radial: THREE.Vector3): void {
  v.addScaledVector(radial, -v.dot(radial));
  if (v.lengthSq() < 1e-8) {
    _tmp.set(0, 1, 0).cross(radial);
    if (_tmp.lengthSq() < 1e-8) _tmp.set(1, 0, 0).cross(radial);
    v.copy(_tmp);
  }
  v.normalize();
}

function crustPenetration(cam: THREE.Vector3): number {
  const len = cam.length();
  if (len < 1e-6) return 0;
  _liftDir.copy(cam).multiplyScalar(1 / len);
  const floorR = MOON_RADIUS + sampleContactHeightDir(_liftDir) + MIN_CLEARANCE;
  return floorR - len;
}

function approachAngle(current: number, target: number, maxDelta: number): number {
  let d = target - current;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  if (Math.abs(d) <= maxDelta) return target;
  return current + Math.sign(d) * maxDelta;
}

function approachScalar(current: number, target: number, maxDelta: number): number {
  const d = target - current;
  if (Math.abs(d) <= maxDelta) return target;
  return current + Math.sign(d) * maxDelta;
}
