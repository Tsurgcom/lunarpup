import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { DirectionalLight } from "three";
import * as THREE from "three";
import { GhostRun } from "./GhostRun";
import { getLocalPose } from "./localPose";
import { LunarRocks } from "./LunarRocks";
import { MoonTerrain } from "./MoonTerrain";
import { Player } from "./Player";
import { RemotePlayers } from "./RemotePlayers";
import { Starfield } from "./Starfield";
import { MOON_RADIUS } from "./terrain";
import type { PlayerSnapshot } from "./types";

type WorldProps = {
  fur: string;
  accent: string;
  name: string;
  active: boolean;
  paused: boolean;
  onSnapshot: (snap: PlayerSnapshot) => void;
};

/** Soft illustrator space — deep teal-navy, not pitch vacuum. */
const SPACE_COLOR = "#1a2a4a";

/**
 * Earth in a fixed inertial direction — visual only.
 */
const EARTH_DIR = new THREE.Vector3(-0.55, 0.28, -0.78).normalize();
const EARTH_DIST = MOON_RADIUS * 14;
const EARTH_POS = EARTH_DIR.clone().multiplyScalar(EARTH_DIST);
const EARTH_RADIUS = 56;

const _target = new THREE.Vector3();
const _radial = new THREE.Vector3();
const _lightPos = new THREE.Vector3();
const _side = new THREE.Vector3();

/**
 * Soft studio key that rides with the pup — contact shadows without a sun.
 * Frustum extents are fixed; only position/target track the pup each frame.
 */
function StudioKey() {
  const light = useRef<DirectionalLight>(null);
  const framed = useRef(false);

  useFrame(() => {
    const L = light.current;
    if (!L) return;
    const pose = getLocalPose();
    _target.set(pose.x, pose.y, pose.z);
    _radial.copy(_target);
    if (_radial.lengthSq() < 1e-6) _radial.set(0, 1, 0);
    else _radial.normalize();

    _side.set(_radial.z, -_radial.x * 0.4, -_radial.x).normalize();
    _lightPos
      .copy(_target)
      .addScaledVector(_radial, 48)
      .addScaledVector(_side, 22);
    L.position.copy(_lightPos);
    L.target.position.copy(_target);
    L.target.updateMatrixWorld();

    if (!framed.current) {
      const cam = L.shadow.camera;
      const extent = 40;
      cam.left = -extent;
      cam.right = extent;
      cam.top = extent;
      cam.bottom = -extent;
      cam.near = 1;
      cam.far = 120;
      cam.updateProjectionMatrix();
      framed.current = true;
    }
  }, -1);

  return (
    <directionalLight
      ref={light}
      intensity={1.05}
      color="#e8f0ff"
      castShadow
      shadow-mapSize={[1024, 1024]}
      shadow-bias={-0.00008}
      shadow-normalBias={0.025}
      shadow-radius={2.5}
    >
      <object3D attach="target" />
    </directionalLight>
  );
}

function Earth() {
  return (
    <group position={[EARTH_POS.x, EARTH_POS.y, EARTH_POS.z]}>
      <mesh>
        <sphereGeometry args={[EARTH_RADIUS, 16, 16]} />
        <meshBasicMaterial color="#4a9fd8" fog={false} />
      </mesh>
      <mesh
        position={[EARTH_RADIUS * 0.35, EARTH_RADIUS * 0.2, EARTH_RADIUS * 0.75]}
        scale={[0.55, 0.4, 0.2]}
      >
        <sphereGeometry args={[EARTH_RADIUS, 10, 10]} />
        <meshBasicMaterial color="#6bcb77" fog={false} />
      </mesh>
      <mesh
        position={[
          -EARTH_RADIUS * 0.5,
          -EARTH_RADIUS * 0.15,
          EARTH_RADIUS * 0.65,
        ]}
        scale={[0.4, 0.55, 0.18]}
      >
        <sphereGeometry args={[EARTH_RADIUS, 10, 10]} />
        <meshBasicMaterial color="#5aad68" fog={false} />
      </mesh>
      <mesh scale={1.08}>
        <sphereGeometry args={[EARTH_RADIUS, 16, 16]} />
        <meshBasicMaterial
          color="#9ad4ff"
          transparent
          opacity={0.28}
          side={THREE.BackSide}
          depthWrite={false}
          fog={false}
        />
      </mesh>
    </group>
  );
}

export function World({
  fur,
  accent,
  name,
  active,
  paused,
  onSnapshot,
}: WorldProps) {
  const fogNear = MOON_RADIUS * 1.05;
  const fogFar = MOON_RADIUS * 2.4;

  return (
    <>
      <color attach="background" args={[SPACE_COLOR]} />
      <fog attach="fog" args={[SPACE_COLOR, fogNear, fogFar]} />

      <ambientLight intensity={0.28} color="#d4e0f5" />
      <hemisphereLight args={["#9ec8ff", "#d4b896", 0.38]} />
      <StudioKey />

      <Starfield />
      <Earth />

      {/* Player before MoonTerrain so pose writes before clipmap LOD. */}
      <Player
        fur={fur}
        accent={accent}
        name={name}
        active={active}
        paused={paused}
        onSnapshot={onSnapshot}
      />
      <MoonTerrain />
      <GhostRun paused={paused} />
      <LunarRocks active={active} />
      <RemotePlayers />
    </>
  );
}
