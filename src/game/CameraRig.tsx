import { useFrame, useThree } from "@react-three/fiber";
import { useRef, type RefObject } from "react";
import * as THREE from "three";
import type { BodyState } from "./physics";
import { MOON_RADIUS, sampleHeightDir } from "./terrain";

type CameraRigProps = {
  body: RefObject<BodyState | null>;
};

/** Preferred chase distance behind the pup (along motion, not yaw). */
const CHASE_DIST = 8;
/** Hard floor — camera never closer than this to the pup. */
const MIN_DIST = 5.5;
const CHASE_HEIGHT = 3.4;
const LOOK_HEIGHT = 1.1;

/** How quickly the chase axis follows travel direction (not steer). */
const DIR_DRAG = 1.1;
const POS_DRAG = 2.1;
const LOOK_DRAG = 2.6;

const MIN_CLEARANCE = 1.2;
/** Ignore tiny velocities so A/D in place doesn't yank the cam. */
const VEL_DIR_MIN = 1.25;

const _radial = new THREE.Vector3();
const _east = new THREE.Vector3();
const _north = new THREE.Vector3();
const _travel = new THREE.Vector3();
const _offset = new THREE.Vector3();

/**
 * Tethered chase cam: follows travel direction on the tangent plane, not board
 * yaw — so A/D turns the pup without spinning the camera. Enforces a minimum
 * separation from the player.
 */
export function CameraRig({ body }: CameraRigProps) {
  const { camera } = useThree();
  const ready = useRef(false);

  const chaseDir = useRef(new THREE.Vector3(0, 0, 1));
  const anchor = useRef(new THREE.Vector3(0, 10, 20));
  const idealPos = useRef(new THREE.Vector3());
  const lookPt = useRef(new THREE.Vector3());
  const idealLook = useRef(new THREE.Vector3());

  useFrame((_, rawDt) => {
    const b = body.current;
    if (!b) return;
    const dt = Math.min(rawDt, 0.05);

    _radial.copy(b.pos).normalize();

    // Chase axis from velocity projected onto the local tangent plane — never
    // from yaw, so steer (A/D) only rotates the dog.
    _travel.copy(b.vel).addScaledVector(_radial, -b.vel.dot(_radial));
    if (_travel.lengthSq() > VEL_DIR_MIN * VEL_DIR_MIN) {
      _travel.normalize();
      const dirBlend = 1 - Math.exp(-DIR_DRAG * dt);
      chaseDir.current.lerp(_travel, dirBlend);
    }

    // Keep chaseDir tangent as we move around the moon.
    chaseDir.current
      .addScaledVector(_radial, -chaseDir.current.dot(_radial));
    if (chaseDir.current.lengthSq() < 1e-8) {
      _east.set(0, 1, 0).cross(_radial);
      if (_east.lengthSq() < 1e-8) _east.set(1, 0, 0).cross(_radial);
      chaseDir.current.copy(_east);
    }
    chaseDir.current.normalize();

    idealPos.current
      .copy(b.pos)
      .addScaledVector(chaseDir.current, -CHASE_DIST)
      .addScaledVector(_radial, CHASE_HEIGHT);

    // Clearance against the crust under the camera.
    _radial.copy(idealPos.current).normalize();
    const floorR =
      MOON_RADIUS + sampleHeightDir(_radial) + MIN_CLEARANCE;
    if (idealPos.current.length() < floorR) {
      idealPos.current.copy(_radial).multiplyScalar(floorR);
    }

    // Minimum distance to the pup (after crust push, which can close the gap).
    enforceMinDistance(idealPos.current, b.pos, MIN_DIST);

    // If min-distance pushed us into the crust, lift again then re-enforce.
    _radial.copy(idealPos.current).normalize();
    const floorR2 =
      MOON_RADIUS + sampleHeightDir(_radial) + MIN_CLEARANCE;
    if (idealPos.current.length() < floorR2) {
      idealPos.current.copy(_radial).multiplyScalar(floorR2);
      enforceMinDistance(idealPos.current, b.pos, MIN_DIST);
    }
    _radial.copy(b.pos).normalize();
    idealLook.current
      .copy(b.pos)
      .addScaledVector(_radial, LOOK_HEIGHT)
      .addScaledVector(chaseDir.current, 2.5);

    if (!ready.current) {
      // Seed chase from an initial behind-the-pup guess using north frame.
      _east.set(0, 1, 0).cross(_radial);
      if (_east.lengthSq() < 1e-8) _east.set(1, 0, 0).cross(_radial);
      _east.normalize();
      _north.crossVectors(_radial, _east).normalize();
      chaseDir.current.copy(_north).multiplyScalar(-1);
      idealPos.current
        .copy(b.pos)
        .addScaledVector(chaseDir.current, -CHASE_DIST)
        .addScaledVector(_radial, CHASE_HEIGHT);
      enforceMinDistance(idealPos.current, b.pos, MIN_DIST);

      anchor.current.copy(idealPos.current);
      lookPt.current.copy(idealLook.current);
      ready.current = true;
    } else {
      const posK = 1 - Math.exp(-POS_DRAG * dt);
      anchor.current.lerp(idealPos.current, posK);
      enforceMinDistance(anchor.current, b.pos, MIN_DIST);

      const lookK = 1 - Math.exp(-LOOK_DRAG * dt);
      lookPt.current.lerp(idealLook.current, lookK);
    }

    camera.position.copy(anchor.current);
    camera.up.copy(_radial.copy(b.pos).normalize());
    camera.lookAt(lookPt.current);
  });

  return null;
}

/** Push `cam` away from `target` along the connecting line until ≥ minDist. */
function enforceMinDistance(
  cam: THREE.Vector3,
  target: THREE.Vector3,
  minDist: number,
): void {
  _offset.copy(cam).sub(target);
  const d = _offset.length();
  if (d < 1e-6) {
    // Degenerate — nudge along world +Y projected away from target radial.
    _radial.copy(target).normalize();
    _offset.set(0, 1, 0).addScaledVector(_radial, -_radial.y);
    if (_offset.lengthSq() < 1e-8) _offset.set(1, 0, 0);
    _offset.normalize().multiplyScalar(minDist);
    cam.copy(target).add(_offset);
    return;
  }
  if (d < minDist) {
    _offset.multiplyScalar(minDist / d);
    cam.copy(target).add(_offset);
  }
}
