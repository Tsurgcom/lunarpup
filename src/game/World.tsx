import { useFrame } from "@react-three/fiber";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
} from "react";
import type { DirectionalLight } from "three";
import * as THREE from "three";
import { ChunkLodDriver } from "./ChunkLodDriver";
import { ChunkTerrain } from "./ChunkTerrain";
import { setTerrainGenerator } from "./chunkLod";
import { GhostRun } from "./GhostRun";
import { getLocalPose } from "./localPose";
import { lunarSurface } from "./lunarTerrain";
import { MOON_RADIUS } from "./moon";
import { PerfTierDriver } from "./PerfTierDriver";
import { Player } from "./Player";
import { getPerfSettings, subscribePerf } from "./performanceTiers";
import { RemotePlayers } from "./RemotePlayers";
import { Starfield } from "./Starfield";
import { StaticMoon } from "./StaticMoon";
import type { PlayerSnapshot } from "./types";

type WorldProps = {
  fur: string;
  accent: string;
  name: string;
  active: boolean;
  paused: boolean;
  onSnapshot: (snap: PlayerSnapshot) => void;
};

/** Soft lunar night — near-black with a hint of cool blue. */
const SPACE_COLOR = "#010106";

/**
 * Earth in a fixed inertial direction — decorative backdrop only.
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
 * Grazing studio key that rides with the pup.
 * Side axis is earthshine projected into the local tangent plane — camera
 * orbit / pup yaw never flip which bowl wall is lit, but crater form still
 * reads. Frustum extents are fixed; only position/target track each frame.
 */
function StudioKey() {
  const light = useRef<DirectionalLight>(null);
  const framed = useRef(false);
  const perf = useSyncExternalStore(
    subscribePerf,
    getPerfSettings,
    getPerfSettings,
  );

  useEffect(() => {
    const L = light.current;
    if (!L) return;
    L.castShadow = perf.shadows;
    const size = perf.shadowMapSize;
    L.shadow.mapSize.set(size, size);
    // Compare the GPU target, not mapSize — R3F applies shadow-mapSize
    // before this effect, so mapSize already matches and we'd skip dispose,
    // leaving a stale 512 RT sampled as 1024 (broken shadows on High/Ultra).
    const map = L.shadow.map;
    if (map && (map.width !== size || map.height !== size)) {
      map.depthTexture?.dispose();
      map.dispose();
      L.shadow.map = null;
    }
  }, [perf.shadows, perf.shadowMapSize]);

  useFrame(() => {
    const L = light.current;
    if (!L) return;
    const pose = getLocalPose();
    _target.set(pose.x, pose.y, pose.z);
    _radial.copy(_target);
    if (_radial.lengthSq() < 1e-6) _radial.set(0, 1, 0);
    else _radial.normalize();

    // Earthshine in the local horizon — stable under camera orbit.
    _side.copy(EARTH_DIR).addScaledVector(_radial, -EARTH_DIR.dot(_radial));
    if (_side.lengthSq() < 1e-4) {
      _side.set(_radial.z, -_radial.x * 0.4, -_radial.x);
    }
    _side.normalize();

    // Elevated + grazing (~40°) so bowl walls and slopes take clear N·L.
    _lightPos
      .copy(_target)
      .addScaledVector(_radial, 36)
      .addScaledVector(_side, 36);
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
      intensity={2.15}
      color="#e4ecf8"
      castShadow={perf.shadows}
      shadow-mapSize={[perf.shadowMapSize, perf.shadowMapSize]}
      shadow-bias={-0.00008}
      shadow-normalBias={0.025}
      shadow-radius={2.2}
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
        <meshBasicMaterial color="#3d8fc4" fog={false} />
      </mesh>
      <mesh
        position={[
          EARTH_RADIUS * 0.35,
          EARTH_RADIUS * 0.2,
          EARTH_RADIUS * 0.75,
        ]}
        scale={[0.55, 0.4, 0.2]}
      >
        <sphereGeometry args={[EARTH_RADIUS, 10, 10]} />
        <meshBasicMaterial color="#5aaf68" fog={false} />
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
        <meshBasicMaterial color="#4a9a5a" fog={false} />
      </mesh>
      {/* Soft glow so Earth reads as the night-side light source. */}
      <mesh scale={1.12}>
        <sphereGeometry args={[EARTH_RADIUS, 16, 16]} />
        <meshBasicMaterial
          color="#7ec8ff"
          transparent
          opacity={0.22}
          side={THREE.BackSide}
          depthWrite={false}
          fog={false}
        />
      </mesh>
      <mesh scale={1.35}>
        <sphereGeometry args={[EARTH_RADIUS, 12, 12]} />
        <meshBasicMaterial
          color="#4a90c8"
          transparent
          opacity={0.08}
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
  const fogDensity = 0.0011;

  useLayoutEffect(() => {
    setTerrainGenerator(lunarSurface);
    return () => setTerrainGenerator(null);
  }, []);

  return (
    <>
      <PerfTierDriver active={active && !paused} />
      <color attach="background" args={[SPACE_COLOR]} />
      <fogExp2 attach="fog" args={[SPACE_COLOR, fogDensity]} />

      {/* Modest fill under a grazing earthshine key — dusty albedo needs some
          lift, but ambient must stay low enough for crater walls to shade. */}
      <ambientLight intensity={0.28} color="#1c2434" />
      <hemisphereLight args={["#8aa0c4", "#0c0e14", 0.45]} />
      <StudioKey />

      <Starfield />
      <Earth />

      <Player
        fur={fur}
        accent={accent}
        name={name}
        active={active}
        paused={paused}
        onSnapshot={onSnapshot}
      />
      {/* After Player so pose + velocity are current for the LOD plan. */}
      <ChunkLodDriver />
      <ChunkTerrain />
      {/* Slightly inset backdrop — streamed chunks sit on top without z-fight. */}
      <StaticMoon />
      <GhostRun paused={paused} />
      <RemotePlayers />
    </>
  );
}
