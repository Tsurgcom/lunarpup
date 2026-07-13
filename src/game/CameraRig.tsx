import { useFrame, useThree } from "@react-three/fiber";
import type { RefObject } from "react";
import * as THREE from "three";
import { boardAxes, type PlayerState } from "./movement";

type CameraRigProps = {
  state: RefObject<PlayerState | null>;
};

const RENDER_PRIORITY = 0;

/** Minecraft-style third person — dead back, slightly above, hard lock. */
const DISTANCE = 8;
const HEIGHT = 3.2;
const LOOK_HEIGHT = 1.2;

const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _look = new THREE.Vector3();

/**
 * Rigid third-person chase. Camera is a fixed offset in the dog's board
 * frame (straight back + up). No side yaw, no horizon projection, no lerp.
 */
export function CameraRig({ state }: CameraRigProps) {
  const { camera } = useThree();

  useFrame(() => {
    const s = state.current;
    if (!s) return;

    const pos = s.pos;
    if (!Number.isFinite(pos.x) || pos.lengthSq() < 1) return;

    boardAxes(s.yaw, s.up, _forward, _right);
    _up.copy(s.up);

    camera.position
      .copy(pos)
      .addScaledVector(_forward, -DISTANCE)
      .addScaledVector(_up, HEIGHT);

    _look.copy(pos).addScaledVector(_up, LOOK_HEIGHT);
    camera.up.copy(_up);
    camera.lookAt(_look);
  }, RENDER_PRIORITY);

  return null;
}
