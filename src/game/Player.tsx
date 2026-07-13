import { useFrame } from "@react-three/fiber";
import { useKeyboardControls } from "@react-three/drei";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { CameraRig } from "./CameraRig";
import { isDebugEnabled, tickDebugFrame } from "./debugFrame";
import { SkateDog } from "./SkateDog";
import { setHudSpeed } from "./hudSpeed";
import { setLocalBody } from "./localBody";
import { setLocalPose } from "./localPose";
import {
  BOARD_CLEARANCE,
  G,
  LEAN_ANGLE,
  MASS,
  PITCH_ANGLE,
  boardAxes,
  createBody,
  stepBody,
  type BodyState,
  type ControlInput,
} from "./physics";
import {
  MOON_RADIUS,
  sampleContactHeightDir,
  sampleHeightDir,
  sampleNormalDir,
  surfacePoint,
} from "./terrain";
import { endGhostLine, tickGhostLine } from "./ghostLine";
import { consumeTeleport } from "./teleport";
import type { PlayerSnapshot } from "./types";

type Controls =
  | "forward"
  | "back"
  | "left"
  | "right"
  | "pitchUp"
  | "pitchDown"
  | "jump"
  | "jetpack";

type PlayerProps = {
  fur: string;
  accent: string;
  name: string;
  /** Idle on the menu — no input, no net sync. */
  active: boolean;
  /** Paused: freeze + appear as a ghost to peers. */
  paused: boolean;
  onSnapshot: (snap: PlayerSnapshot) => void;
};

/**
 * R3F priority: lower runs first. Only priority > 0 disables auto-render —
 * so we stay ≤ 0 and order with negatives.
 * -2 = integrate body + publish localBody (before rocks)
 * -1 = LunarRocks collisions mutate body.pos
 *  0 = pup mesh / quat / pose (after rocks; before MoonTerrain)
 */
const PHYS_PRIORITY = -2;
const RENDER_PRIORITY = 0;

/** Fixed integrator step — variable frame dt only feeds the accumulator. */
const FIXED_DT = 1 / 60;
const MAX_PHYS_STEPS = 5;

/**
 * Grounded moon-radius follow rate (1/s). Direction tracks body 1:1; only |r|
 * is low-passed so contact chatter cannot bleed into tangential (fwd/back).
 */
const RADIAL_DAMP = 20;
/** Snap quat when within this angle (rad) of the surface target. */
const QUAT_SNAP = 0.004;

export function Player({
  fur,
  accent,
  name,
  active,
  paused,
  onSnapshot,
}: PlayerProps) {
  const group = useRef<THREE.Group>(null);
  const bodyRef = useRef<BodyState>(createBody());
  const [, getKeys] = useKeyboardControls<Controls>();

  const forward = useRef(new THREE.Vector3());
  const right = useRef(new THREE.Vector3());
  const quat = useRef(new THREE.Quaternion());
  const targetQuat = useRef(new THREE.Quaternion());
  const look = useRef(new THREE.Matrix4());
  const leanQ = useRef(new THREE.Quaternion());
  const pitchQ = useRef(new THREE.Quaternion());
  const euler = useRef(new THREE.Euler());
  const hudAcc = useRef(0);
  const syncAcc = useRef(0);
  const jumpHeld = useRef(false);
  /** Edge-triggered ollie held until a fixed physics step consumes it. */
  const jumpQueued = useRef(false);
  const warpDir = useRef(new THREE.Vector3());
  /** Mesh / camera pose — post-rock body with radius smoothing. */
  const renderPos = useRef(new THREE.Vector3());
  /** Smoothed moon-centric radius for grounded mesh (0 = unsynced). */
  const renderRadius = useRef(0);
  const physAcc = useRef(0);
  const prevBodyPos = useRef(new THREE.Vector3());
  const prevRenderPos = useRef(new THREE.Vector3());
  const debugOn = useRef(isDebugEnabled());
  const _dbgBodyStep = useRef(new THREE.Vector3());
  const _dbgRenderStep = useRef(new THREE.Vector3());
  const _dbgGap = useRef(new THREE.Vector3());
  const _dbgRadial = useRef(new THREE.Vector3());
  const _dbgN = useRef(new THREE.Vector3());
  const _dbgSurf = useRef(new THREE.Vector3());
  const _dbgTmp = useRef(new THREE.Vector3());
  /** Reused net payload — mutate fields; avoid per-tick object allocation. */
  const snapBuf = useRef<PlayerSnapshot>({
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    pitch: 0,
    roll: 0,
    speed: 0,
    fur,
    accent,
    name,
    ghost: false,
  });
  const inputRef = useRef<ControlInput>({
    forward: false,
    back: false,
    left: false,
    right: false,
    pitchUp: false,
    pitchDown: false,
    jump: false,
    jetpack: false,
  });

  useEffect(() => {
    const b = createBody();
    bodyRef.current = b;
    renderPos.current.copy(b.pos);
    renderRadius.current = b.pos.length();
    prevBodyPos.current.copy(b.pos);
    prevRenderPos.current.copy(b.pos);
    physAcc.current = 0;
  }, []);

  useEffect(() => {
    syncAcc.current = 1;
  }, [paused]);

  useEffect(() => {
    if (paused) endGhostLine();
  }, [paused]);

  // Integrate before LunarRocks so collisions see a fresh body this frame.
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const b = bodyRef.current;

    if (active && !paused) {
      const warp = consumeTeleport();
      if (warp) {
        endGhostLine();
        warpDir.current.set(warp.x, warp.y, warp.z).normalize();
        if (warpDir.current.lengthSq() < 1e-8) {
          warpDir.current.set(0, 0, 1);
        }
        surfacePoint(warpDir.current, BOARD_CLEARANCE, b.pos);
        b.vel.set(0, 0, 0);
        b.grounded = true;
        sampleNormalDir(warpDir.current, b.normal);
        b.normalForce = MASS * G;
        renderPos.current.copy(b.pos);
        renderRadius.current = b.pos.length();
        prevBodyPos.current.copy(b.pos);
        prevRenderPos.current.copy(b.pos);
        physAcc.current = 0;
      }

      const keys = getKeys();
      const jumpPressed = keys.jump && !jumpHeld.current;
      jumpHeld.current = keys.jump;
      if (jumpPressed) jumpQueued.current = true;

      const input = inputRef.current;
      input.forward = keys.forward;
      input.back = keys.back;
      input.left = keys.left;
      input.right = keys.right;
      input.pitchUp = keys.pitchUp;
      input.pitchDown = keys.pitchDown;
      input.jetpack = keys.jetpack;

      // Fixed steps only — no render lerp (lerp fought rock nudges). Carry
      // leftover time so frame-time noise does not stretch the integrator.
      physAcc.current += dt;
      let steps = 0;
      while (physAcc.current >= FIXED_DT && steps < MAX_PHYS_STEPS) {
        input.jump = jumpQueued.current;
        stepBody(b, input, FIXED_DT);
        if (jumpQueued.current) jumpQueued.current = false;
        input.jump = false;
        physAcc.current -= FIXED_DT;
        steps++;
      }
      if (steps >= MAX_PHYS_STEPS) physAcc.current = 0;

      setLocalBody(b);
    } else {
      jumpHeld.current = false;
      jumpQueued.current = false;
      physAcc.current = 0;
      setLocalBody(b);
    }
  }, PHYS_PRIORITY);

  // After LunarRocks (-1) — one atomic mesh/quat/pose write from final body.
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const b = bodyRef.current;
    const ghost = paused;
    const dog = group.current;
    const speed = paused || !active ? 0 : b.vel.length();

    // Orientation from post-rock body so quat matches the mesh position.
    boardAxes(b.yaw, b.normal, forward.current, right.current);
    look.current.makeBasis(right.current, b.normal, forward.current);
    targetQuat.current.setFromRotationMatrix(look.current);
    if (active && !paused) {
      leanQ.current.setFromAxisAngle(
        forward.current,
        -b.lean * LEAN_ANGLE,
      );
      targetQuat.current.premultiply(leanQ.current);
      if (b.grounded) {
        pitchQ.current.setFromAxisAngle(
          right.current,
          -b.pitch * PITCH_ANGLE,
        );
        targetQuat.current.premultiply(pitchQ.current);
      }
      if (b.grounded && quat.current.angleTo(targetQuat.current) < QUAT_SNAP) {
        quat.current.copy(targetQuat.current);
      } else {
        const follow = b.grounded
          ? 1 - Math.exp(-28 * dt)
          : 1 - Math.exp(-14 * dt);
        quat.current.slerp(targetQuat.current, follow);
      }
    } else {
      quat.current.copy(targetQuat.current);
    }

    const dampActive = active && !paused && b.grounded;
    const bodyR = b.pos.length();
    // Direction = body (tangential exact). Low-pass |r| only — avoids the old
    // world-space residual that bled into forward/back when normals chattered.
    if (dampActive && bodyR > 1e-6) {
      let rSmooth = renderRadius.current;
      if (rSmooth < 1e-6) rSmooth = bodyR;
      const radialK = 1 - Math.exp(-RADIAL_DAMP * dt);
      rSmooth += (bodyR - rSmooth) * radialK;
      renderRadius.current = rSmooth;
      renderPos.current.copy(b.pos).multiplyScalar(rSmooth / bodyR);
    } else {
      renderRadius.current = bodyR;
      renderPos.current.copy(b.pos);
    }

    if (dog) {
      dog.position.copy(renderPos.current);
      dog.quaternion.copy(quat.current);
    }

    setLocalPose(
      renderPos.current.x,
      renderPos.current.y,
      renderPos.current.z,
      b.yaw,
    );

    if (debugOn.current && active) {
      const n = b.normal;
      const bodyStep = _dbgBodyStep.current;
      bodyStep.copy(b.pos).sub(prevBodyPos.current);
      const bodyRadial = bodyStep.dot(n);
      const bodyTangential = Math.sqrt(
        Math.max(0, bodyStep.lengthSq() - bodyRadial * bodyRadial),
      );

      const renderStep = _dbgRenderStep.current;
      renderStep.copy(renderPos.current).sub(prevRenderPos.current);

      const gap = _dbgGap.current;
      gap.copy(b.pos).sub(renderPos.current);
      const gapRadial = gap.dot(n);

      const radial = _dbgRadial.current;
      radial.copy(b.pos).normalize();
      const hAnalytic = sampleHeightDir(radial);
      const h = sampleContactHeightDir(radial, hAnalytic);
      sampleNormalDir(radial, _dbgN.current, 0.7, hAnalytic);
      _dbgSurf.current.copy(radial).multiplyScalar(MOON_RADIUS + h);
      const height = _dbgTmp.current
        .copy(b.pos)
        .sub(_dbgSurf.current)
        .dot(_dbgN.current);
      const penetration = BOARD_CLEARANCE - height;

      tickDebugFrame({
        dtMs: dt * 1000,
        speed,
        grounded: b.grounded,
        airTime: b.airTime,
        lean: b.lean,
        pitch: b.pitch,
        normalForce: b.normalForce,
        vn: b.vel.dot(n),
        penetration,
        bodyDelta: bodyStep.length(),
        bodyRadial,
        bodyTangential,
        renderDelta: renderStep.length(),
        bodyRenderGap: gap.length(),
        bodyRenderRadial: gapRadial,
        quatErr: quat.current.angleTo(targetQuat.current),
        dampActive,
      });

      prevBodyPos.current.copy(b.pos);
      prevRenderPos.current.copy(renderPos.current);
    }

    if (active) {
      euler.current.setFromQuaternion(quat.current, "YXZ");
      if (!paused) {
        tickGhostLine(
          renderPos.current.x,
          renderPos.current.y,
          renderPos.current.z,
          euler.current.y,
          euler.current.x,
          euler.current.z,
          b.airTime,
          speed,
          dt,
        );
      }
    }

    hudAcc.current += dt;
    if (hudAcc.current > 0.1) {
      hudAcc.current = 0;
      setHudSpeed(speed);
    }

    if (!active) return;

    syncAcc.current += dt;
    if (syncAcc.current > 0.05) {
      syncAcc.current = 0;
      const s = snapBuf.current;
      s.x = renderPos.current.x;
      s.y = renderPos.current.y;
      s.z = renderPos.current.z;
      s.yaw = euler.current.y;
      s.pitch = euler.current.x;
      s.roll = euler.current.z;
      s.speed = b.vel.length();
      s.fur = fur;
      s.accent = accent;
      s.name = name;
      s.ghost = ghost;
      onSnapshot(s);
    }
  }, RENDER_PRIORITY);

  return (
    <>
      <SkateDog ref={group} fur={fur} accent={accent} ghost={paused} />
      <CameraRig body={bodyRef} renderPos={renderPos} />
    </>
  );
}
