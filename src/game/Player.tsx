import { useFrame, useThree } from "@react-three/fiber";
import { useKeyboardControls } from "@react-three/drei";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { CameraRig } from "./CameraRig";
import { SkateDog } from "./SkateDog";
import { setLocalPose } from "./localPose";
import {
  BOARD_CLEARANCE,
  G,
  MASS,
  boardAxes,
  createBody,
  stepBody,
  type BodyState,
  type ControlInput,
} from "./physics";
import {
  curvedSurfaceY,
  sampleHeight,
  sampleNormal,
  unwrapToward,
  wrapCoord,
} from "./terrain";
import { consumeTeleport } from "./teleport";
import type { PlayerSnapshot } from "./types";

type Controls = "forward" | "back" | "left" | "right" | "jump" | "brake";

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
  const bodyRef = useRef<BodyState>(createBody(0, 14));
  const [, getKeys] = useKeyboardControls<Controls>();
  const { camera } = useThree();

  const forward = useRef(new THREE.Vector3());
  const right = useRef(new THREE.Vector3());
  const quat = useRef(new THREE.Quaternion());
  const targetQuat = useRef(new THREE.Quaternion());
  const look = useRef(new THREE.Matrix4());
  const leanQ = useRef(new THREE.Quaternion());
  const euler = useRef(new THREE.Euler());
  const hudAcc = useRef(0);
  const syncAcc = useRef(0);
  const jumpHeld = useRef(false);

  useEffect(() => {
    bodyRef.current = createBody(0, 14);
  }, []);

  // Push ghost/solid state to peers immediately on pause toggle.
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
        // Stay on the current unwrap sheet so warps don't feel like a world reset.
        const x = unwrapToward(wrapCoord(warp.x), b.pos.x);
        const z = unwrapToward(wrapCoord(warp.z), b.pos.z);
        b.pos.set(x, sampleHeight(x, z) + BOARD_CLEARANCE, z);
        b.vel.set(0, 0, 0);
        b.grounded = true;
        sampleNormal(x, z, b.normal);
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
        jump: jumpPressed,
        brake: keys.brake || keys.back,
      };

      stepBody(b, input, dt);

      boardAxes(b.yaw, b.normal, forward.current, right.current);
      look.current.makeBasis(right.current, b.normal, forward.current);
      targetQuat.current.setFromRotationMatrix(look.current);

      const lean = (keys.left ? 1 : 0) - (keys.right ? 1 : 0);
      leanQ.current.setFromAxisAngle(forward.current, lean * 0.22);
      targetQuat.current.premultiply(leanQ.current);
      quat.current.slerp(targetQuat.current, 1 - Math.exp(-14 * dt));
    } else {
      jumpHeld.current = false;
    }

    const dog = group.current;
    if (dog) {
      dog.position.set(
        b.pos.x,
        curvedSurfaceY(
          b.pos.x,
          b.pos.z,
          b.pos.y,
          camera.position.x,
          camera.position.z,
        ),
        b.pos.z,
      );
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
        x: wrapCoord(b.pos.x),
        y: b.pos.y,
        z: wrapCoord(b.pos.z),
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
