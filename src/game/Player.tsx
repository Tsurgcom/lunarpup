import { useFrame } from "@react-three/fiber";
import { useKeyboardControls } from "@react-three/drei";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { CameraRig } from "./CameraRig";
import { SkateDog } from "./SkateDog";
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
import { sampleNormalDir, surfacePoint } from "./terrain";
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
  onSpeed: (speed: number) => void;
};

export function Player({
  fur,
  accent,
  name,
  active,
  paused,
  onSnapshot,
  onSpeed,
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
  const warpDir = useRef(new THREE.Vector3());

  useEffect(() => {
    bodyRef.current = createBody();
  }, []);

  useEffect(() => {
    syncAcc.current = 1;
  }, [paused]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const b = bodyRef.current;
    const ghost = paused;

    if (active && !paused) {
      const warp = consumeTeleport();
      if (warp) {
        warpDir.current.set(warp.x, warp.y, warp.z).normalize();
        if (warpDir.current.lengthSq() < 1e-8) {
          warpDir.current.set(0, 0, 1);
        }
        surfacePoint(warpDir.current, BOARD_CLEARANCE, b.pos);
        b.vel.set(0, 0, 0);
        b.grounded = true;
        sampleNormalDir(warpDir.current, b.normal);
        b.normalForce = MASS * G;
      }

      const keys = getKeys();

      const jumpPressed = keys.jump && !jumpHeld.current;
      jumpHeld.current = keys.jump;

      const input: ControlInput = {
        forward: keys.forward,
        back: keys.back,
        left: keys.left,
        right: keys.right,
        pitchUp: keys.pitchUp,
        pitchDown: keys.pitchDown,
        jump: jumpPressed,
        jetpack: keys.jetpack,
      };

      stepBody(b, input, dt);
      setLocalBody(b);

      boardAxes(b.yaw, b.normal, forward.current, right.current);
      look.current.makeBasis(right.current, b.normal, forward.current);
      targetQuat.current.setFromRotationMatrix(look.current);

      // Lean follows physics lean; negate so +lean (A) tips the left rail down.
      leanQ.current.setFromAxisAngle(
        forward.current,
        -b.lean * LEAN_ANGLE,
      );
      targetQuat.current.premultiply(leanQ.current);
      // Grounded: R/F is a visual nose tip (surface owns the normal).
      // Airborne: attitude already includes pitch from the integrator.
      if (b.grounded) {
        pitchQ.current.setFromAxisAngle(
          right.current,
          -b.pitch * PITCH_ANGLE,
        );
        targetQuat.current.premultiply(pitchQ.current);
      }
      // Follow surface tilt tightly while grounded — lag here reads as a
      // fixed-world rotation and digs the deck into bowl walls.
      const follow = b.grounded ? 1 - Math.exp(-28 * dt) : 1 - Math.exp(-14 * dt);
      quat.current.slerp(targetQuat.current, follow);
    } else {
      jumpHeld.current = false;
      setLocalBody(b);
    }

    const dog = group.current;
    if (dog) {
      dog.position.copy(b.pos);
      dog.quaternion.copy(quat.current);
    }

    setLocalPose(b.pos.x, b.pos.y, b.pos.z, b.yaw);

    const speed = paused || !active ? 0 : b.vel.length();

    hudAcc.current += dt;
    if (hudAcc.current > 0.1) {
      hudAcc.current = 0;
      onSpeed(speed);
    }

    if (!active) return;

    syncAcc.current += dt;
    if (syncAcc.current > 0.05) {
      syncAcc.current = 0;
      euler.current.setFromQuaternion(quat.current, "YXZ");
      onSnapshot({
        x: b.pos.x,
        y: b.pos.y,
        z: b.pos.z,
        yaw: euler.current.y,
        pitch: euler.current.x,
        roll: euler.current.z,
        speed: b.vel.length(),
        fur,
        accent,
        name,
        ghost,
      });
    }
  });

  return (
    <>
      <SkateDog ref={group} fur={fur} accent={accent} ghost={paused} />
      <CameraRig body={bodyRef} />
    </>
  );
}
