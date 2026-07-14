import { useKeyboardControls } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { CameraRig } from "./CameraRig";
import { isDebugEnabled, tickDebugFrame } from "./debugFrame";
import { endGhostLine, tickGhostLine } from "./ghostLine";
import { setHudSpeed } from "./hudSpeed";
import { setLocalPose } from "./localPose";
import { SPAWN_DIR } from "./moon";
import {
  boardAxes,
  type ControlInput,
  createPlayer,
  type PlayerState,
  stepPlayer,
} from "./movement";
import { physics } from "./physicsTuning";
import { plantOnShell } from "./rideShell";
import { SkateDog } from "./SkateDog";
import { setSpeedFx } from "./speedLinesUtil";
import { consumeTeleport } from "./teleport";
import type { PlayerSnapshot } from "./types";

type Controls =
  | "forward"
  | "back"
  | "left"
  | "right"
  | "pitchUp"
  | "pitchDown"
  | "rollLeft"
  | "rollRight"
  | "jump"
  | "boost";

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

const PHYS_PRIORITY = -2;
const RENDER_PRIORITY = 0;

const FIXED_DT = 1 / 60;
const MAX_PHYS_STEPS = 5;

const QUAT_SNAP = 0.08;
const QUAT_FOLLOW = 24;

export function Player({
  fur,
  accent,
  name,
  active,
  paused,
  onSnapshot,
}: PlayerProps) {
  const group = useRef<THREE.Group>(null);
  const stateRef = useRef<PlayerState>(createPlayer());
  const [, getKeys] = useKeyboardControls<Controls>();

  const forward = useRef(new THREE.Vector3());
  const right = useRef(new THREE.Vector3());
  const quat = useRef(new THREE.Quaternion());
  const targetQuat = useRef(new THREE.Quaternion());
  const look = useRef(new THREE.Matrix4());
  const leanQ = useRef(new THREE.Quaternion());
  const pitchQ = useRef(new THREE.Quaternion());
  const rollQ = useRef(new THREE.Quaternion());
  const euler = useRef(new THREE.Euler());
  const hudAcc = useRef(0);
  const syncAcc = useRef(0);
  const physAcc = useRef(0);
  const warpDir = useRef(new THREE.Vector3());
  const prevPos = useRef(new THREE.Vector3());
  const debugOn = useRef(isDebugEnabled());
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
    rollLeft: false,
    rollRight: false,
    boosting: false,
    jump: false,
  });

  useEffect(() => {
    const s = createPlayer();
    stateRef.current = s;
    prevPos.current.copy(s.pos);
    physAcc.current = 0;
  }, []);

  useEffect(() => {
    void paused;
    syncAcc.current = 1;
  }, [paused]);

  useEffect(() => {
    if (paused) endGhostLine();
  }, [paused]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const s = stateRef.current;

    if (active && !paused) {
      const warp = consumeTeleport();
      if (warp) {
        endGhostLine();
        warpDir.current.set(warp.x, warp.y, warp.z).normalize();
        if (warpDir.current.lengthSq() < 1e-8) {
          warpDir.current.copy(SPAWN_DIR);
        }
        plantOnShell(warpDir.current, s.pos);
        s.pos.addScaledVector(warpDir.current, physics.softBand * 0.35 + 0.8);
        s.up.copy(warpDir.current);
        s.contactNormal.copy(warpDir.current);
        s.vel.set(0, 0, 0);
        s.lean = 0;
        s.pitch = 0;
        s.roll = 0;
        s.grounded = false;
        s.airTime = 0;
        s.coyote = 0;
        s.jumpBuffer = 0;
        s.jumpHeld = false;
        s.landingPunch = 0;
        prevPos.current.copy(s.pos);
        physAcc.current = 0;
      }

      const keys = getKeys();
      const input = inputRef.current;
      input.forward = keys.forward;
      input.back = keys.back;
      input.left = keys.left;
      input.right = keys.right;
      input.pitchUp = keys.pitchUp;
      input.pitchDown = keys.pitchDown;
      input.rollLeft = keys.rollLeft;
      input.rollRight = keys.rollRight;
      input.boosting = keys.boost;
      input.jump = keys.jump;

      physAcc.current += dt;
      let steps = 0;
      while (physAcc.current >= FIXED_DT && steps < MAX_PHYS_STEPS) {
        stepPlayer(s, input, FIXED_DT);
        physAcc.current -= FIXED_DT;
        steps++;
      }
    } else {
      physAcc.current = 0;
    }
  }, PHYS_PRIORITY);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const s = stateRef.current;
    const ghost = paused;
    const dog = group.current;
    const speed = paused || !active ? 0 : s.vel.length();

    boardAxes(s.yaw, s.up, forward.current, right.current);
    look.current.makeBasis(right.current, s.up, forward.current);
    targetQuat.current.setFromRotationMatrix(look.current);
    if (active && !paused) {
      leanQ.current.setFromAxisAngle(
        forward.current,
        -s.lean * physics.leanAngle,
      );
      targetQuat.current.premultiply(leanQ.current);
      pitchQ.current.setFromAxisAngle(
        right.current,
        -s.pitch * physics.pitchAngle,
      );
      targetQuat.current.premultiply(pitchQ.current);
      rollQ.current.setFromAxisAngle(
        forward.current,
        -s.roll * physics.pitchAngle,
      );
      targetQuat.current.premultiply(rollQ.current);
      if (quat.current.angleTo(targetQuat.current) < QUAT_SNAP) {
        quat.current.copy(targetQuat.current);
      } else {
        const follow = 1 - Math.exp(-QUAT_FOLLOW * dt);
        quat.current.slerp(targetQuat.current, follow);
      }
    } else {
      quat.current.copy(targetQuat.current);
    }

    if (dog) {
      dog.position.copy(s.pos);
      dog.quaternion.copy(quat.current);
    }

    setLocalPose(
      s.pos.x,
      s.pos.y,
      s.pos.z,
      s.yaw,
      paused || !active ? 0 : s.vel.x,
      paused || !active ? 0 : s.vel.y,
      paused || !active ? 0 : s.vel.z,
    );

    if (debugOn.current && active) {
      const step = s.pos.distanceTo(prevPos.current);
      tickDebugFrame({
        dtMs: dt * 1000,
        speed,
        lean: s.lean,
        pitch: s.pitch,
        bodyDelta: step,
        quatErr: quat.current.angleTo(targetQuat.current),
      });
      prevPos.current.copy(s.pos);
    }

    if (active) {
      euler.current.setFromQuaternion(quat.current, "YXZ");
      if (!paused) {
        tickGhostLine(
          s.pos.x,
          s.pos.y,
          s.pos.z,
          euler.current.y,
          euler.current.x,
          euler.current.z,
          s.airTime,
          speed,
          dt,
        );
      }
    }

    // Speed / air / landing FX — every frame for smooth pulse.
    const cruise = physics.maxSpeed > 0 ? physics.maxSpeed : 1;
    const airHang = s.grounded
      ? 0
      : THREE.MathUtils.clamp(s.airTime / 0.7, 0, 1);
    setSpeedFx(
      active && !paused ? THREE.MathUtils.clamp(speed / cruise, 0, 1) : 0,
      active && !paused ? airHang : 0,
      active && !paused ? s.landingPunch : 0,
      active && !paused && s.boosting,
    );

    hudAcc.current += dt;
    if (hudAcc.current > 0.1) {
      hudAcc.current = 0;
      setHudSpeed(speed, active && !paused && s.boosting);
    }

    if (!active) return;

    syncAcc.current += dt;
    if (syncAcc.current > 0.05) {
      syncAcc.current = 0;
      const snap = snapBuf.current;
      snap.x = s.pos.x;
      snap.y = s.pos.y;
      snap.z = s.pos.z;
      snap.yaw = euler.current.y;
      snap.pitch = euler.current.x;
      snap.roll = euler.current.z;
      snap.speed = s.vel.length();
      snap.fur = fur;
      snap.accent = accent;
      snap.name = name;
      snap.ghost = ghost;
      onSnapshot(snap);
    }
  }, RENDER_PRIORITY);

  return (
    <>
      <SkateDog ref={group} fur={fur} accent={accent} ghost={paused} />
      <CameraRig state={stateRef} />
    </>
  );
}
