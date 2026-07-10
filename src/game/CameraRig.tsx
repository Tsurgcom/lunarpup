import { useFrame, useThree } from "@react-three/fiber";
import { useRef, type RefObject } from "react";
import * as THREE from "three";
import type { BodyState } from "./physics";
import { curvedSurfaceY, sampleHeight } from "./terrain";

type CameraRigProps = {
  body: RefObject<BodyState | null>;
};

/** Fixed offset behind the pup (world-horizontal). */
const CHASE_DIST = 8;
const CHASE_HEIGHT = 3.4;
const LOOK_HEIGHT = 1.1;

/** How quickly the tether direction catches up to board heading. */
const DIR_DRAG = 1.6;
/** How heavily the camera body is dragged along (lower = more lag). */
const POS_DRAG = 2.1;
/** Look target drag — slightly tighter than position. */
const LOOK_DRAG = 2.6;

const MIN_CLEARANCE = 1.2;

function flatForward(yaw: number, out: THREE.Vector3): THREE.Vector3 {
  return out.set(-Math.sin(yaw), 0, -Math.cos(yaw));
}

/**
 * Tethered chase cam: a loose rig dragged behind the player on a horizontal
 * line. Ignores terrain tilt and velocity jitter for stability.
 */
export function CameraRig({ body }: CameraRigProps) {
  const { camera } = useThree();
  const ready = useRef(false);

  const chaseDir = useRef(new THREE.Vector3(0, 0, 1));
  const flatFwd = useRef(new THREE.Vector3());
  const up = useRef(new THREE.Vector3(0, 1, 0));

  const anchor = useRef(new THREE.Vector3(0, 10, 20));
  const idealPos = useRef(new THREE.Vector3());

  const lookPt = useRef(new THREE.Vector3());
  const idealLook = useRef(new THREE.Vector3());

  useFrame((_, rawDt) => {
    const b = body.current;
    if (!b) return;
    const dt = Math.min(rawDt, 0.05);

    flatForward(b.yaw, flatFwd.current);
    const dirBlend = 1 - Math.exp(-DIR_DRAG * dt);
    chaseDir.current.lerp(flatFwd.current, dirBlend);

    idealPos.current
      .copy(b.pos)
      .addScaledVector(chaseDir.current, -CHASE_DIST)
      .addScaledVector(up.current, CHASE_HEIGHT);

    // Clearance against the curved visual surface (matches terrain shader).
    const floor =
      curvedSurfaceY(
        idealPos.current.x,
        idealPos.current.z,
        sampleHeight(idealPos.current.x, idealPos.current.z),
        b.pos.x,
        b.pos.z,
      ) + MIN_CLEARANCE;
    if (idealPos.current.y < floor) idealPos.current.y = floor;

    idealLook.current
      .copy(b.pos)
      .addScaledVector(up.current, LOOK_HEIGHT)
      .addScaledVector(chaseDir.current, 2.5);

    if (!ready.current) {
      anchor.current.copy(idealPos.current);
      lookPt.current.copy(idealLook.current);
      ready.current = true;
    } else {
      const posK = 1 - Math.exp(-POS_DRAG * dt);
      anchor.current.lerp(idealPos.current, posK);

      const lookK = 1 - Math.exp(-LOOK_DRAG * dt);
      lookPt.current.lerp(idealLook.current, lookK);
    }

    camera.position.copy(anchor.current);
    camera.up.set(0, 1, 0);
    camera.lookAt(lookPt.current);
  });

  return null;
}
