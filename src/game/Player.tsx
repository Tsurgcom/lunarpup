import { useFrame } from "@react-three/fiber";
import { useKeyboardControls } from "@react-three/drei";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { CameraRig } from "./CameraRig";
import { SkateDog } from "./SkateDog";
import {
  boardAxes,
  createBody,
  stepBody,
  type BodyState,
  type ControlInput,
} from "./physics";
import type { PlayerSnapshot } from "./types";

type Controls = "forward" | "back" | "left" | "right" | "jump" | "brake";

type PlayerProps = {
  fur: string;
  accent: string;
  name: string;
  onSnapshot: (snap: PlayerSnapshot) => void;
  onSpeed: (speed: number) => void;
};

export function Player({ fur, accent, name, onSnapshot, onSpeed }: PlayerProps) {
  const group = useRef<THREE.Group>(null);
  const bodyRef = useRef<BodyState>(createBody(0, 14));
  const [, getKeys] = useKeyboardControls<Controls>();

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

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const b = bodyRef.current;
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

    const dog = group.current;
    if (dog) {
      dog.position.copy(b.pos);
      dog.quaternion.copy(quat.current);
    }

    const speed = b.vel.length();

    hudAcc.current += dt;
    if (hudAcc.current > 0.1) {
      hudAcc.current = 0;
      onSpeed(speed);
    }

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
        speed,
        fur,
        accent,
        name,
      });
    }
  });

  return (
    <>
      <SkateDog ref={group} fur={fur} accent={accent} />
      <CameraRig body={bodyRef} />
    </>
  );
}
