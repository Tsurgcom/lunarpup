import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import type { DirectionalLight } from "three";
import { getLocalPose } from "./localPose";
import { LunarRocks } from "./LunarRocks";
import { MoonTerrain } from "./MoonTerrain";
import { Player } from "./Player";
import { RemotePlayers } from "./RemotePlayers";
import { Starfield } from "./Starfield";
import { setSunLightDir, SUN_DIR } from "./sun";
import { MOON_RADIUS } from "./terrain";
import type { PlayerSnapshot } from "./types";

type WorldProps = {
  fur: string;
  accent: string;
  name: string;
  active: boolean;
  paused: boolean;
  onSnapshot: (snap: PlayerSnapshot) => void;
  onSpeed: (speed: number) => void;
};

const SUN_SKY_DIST = 900;
/** Clear readable disc (~1.5°); real sun is ~0.5°. */
const SUN_RADIUS = 12;

/**
 * Earth in a fixed inertial direction — visual only (no earthshine light).
 */
const EARTH_DIR = new THREE.Vector3(-0.55, 0.28, -0.78).normalize();
const EARTH_DIST = MOON_RADIUS * 14;
const EARTH_POS = EARTH_DIR.clone().multiplyScalar(EARTH_DIST);
const EARTH_RADIUS = 42;

const _lightPos = new THREE.Vector3();
const _target = new THREE.Vector3();
const _sunSky = new THREE.Vector3();
const _lightDir = new THREE.Vector3();

/**
 * Sole light source: visible sun disc + directional key that casts shadows.
 * Disc is camera-locked; light aims from disc → pup so crater shadows match.
 */
function Sun() {
  const light = useRef<DirectionalLight>(null);
  const disc = useRef<THREE.Group>(null);

  useFrame(({ camera }) => {
    const L = light.current;
    const g = disc.current;
    if (!L || !g) return;

    _sunSky.copy(camera.position).addScaledVector(SUN_DIR, SUN_SKY_DIST);
    g.position.copy(_sunSky);

    const pose = getLocalPose();
    _target.set(pose.x, pose.y, pose.z);
    _lightDir.copy(_sunSky).sub(_target);
    if (_lightDir.lengthSq() < 1e-6) _lightDir.copy(SUN_DIR);
    else _lightDir.normalize();
    setSunLightDir(_lightDir);

    _lightPos.copy(_target).addScaledVector(_lightDir, MOON_RADIUS * 0.9);
    L.position.copy(_lightPos);
    L.target.position.copy(_target);
    L.target.updateMatrixWorld();

    // Tight ortho frustum around the pup — a huge far plane was shredding
    // depth precision into stripe artifacts.
    const cam = L.shadow.camera;
    const extent = 36;
    const lightDist = MOON_RADIUS * 0.9;
    cam.left = -extent;
    cam.right = extent;
    cam.top = extent;
    cam.bottom = -extent;
    cam.near = Math.max(1, lightDist - extent * 1.25);
    cam.far = lightDist + extent * 1.25;
    cam.updateProjectionMatrix();
  }, -1);

  return (
    <>
      <directionalLight
        ref={light}
        castShadow
        intensity={4.2}
        color="#fff6e8"
        position={[MOON_RADIUS * 2.2, MOON_RADIUS * 1.6, MOON_RADIUS * 1.1]}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.00004}
        shadow-normalBias={0.02}
        shadow-radius={2.5}
      >
        <object3D attach="target" />
      </directionalLight>

      <group ref={disc} frustumCulled={false}>
        <mesh frustumCulled={false}>
          <sphereGeometry args={[SUN_RADIUS, 32, 32]} />
          <meshBasicMaterial color="#fffaf0" fog={false} toneMapped={false} />
        </mesh>
        <mesh scale={1.15} frustumCulled={false}>
          <sphereGeometry args={[SUN_RADIUS, 32, 32]} />
          <meshBasicMaterial
            color="#ffe29a"
            transparent
            opacity={0.9}
            fog={false}
            toneMapped={false}
            depthWrite={false}
          />
        </mesh>
        <mesh scale={2.6} frustumCulled={false}>
          <sphereGeometry args={[SUN_RADIUS, 24, 24]} />
          <meshBasicMaterial
            color="#ffc45c"
            transparent
            opacity={0.25}
            fog={false}
            toneMapped={false}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
        <mesh scale={6} frustumCulled={false}>
          <sphereGeometry args={[SUN_RADIUS, 16, 16]} />
          <meshBasicMaterial
            color="#ff9a3a"
            transparent
            opacity={0.1}
            fog={false}
            toneMapped={false}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      </group>
    </>
  );
}

function Earth() {
  return (
    <group position={[EARTH_POS.x, EARTH_POS.y, EARTH_POS.z]}>
      <mesh>
        <sphereGeometry args={[EARTH_RADIUS, 48, 48]} />
        <meshBasicMaterial color="#5a8fc4" fog={false} />
      </mesh>
      <mesh scale={1.035}>
        <sphereGeometry args={[EARTH_RADIUS, 48, 48]} />
        <meshBasicMaterial
          color="#a8d4ff"
          transparent
          opacity={0.14}
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
  onSpeed,
}: WorldProps) {
  const fogNear = MOON_RADIUS * 1.15;
  const fogFar = MOON_RADIUS * 2.6;

  return (
    <>
      <color attach="background" args={["#02040a"]} />
      <fog attach="fog" args={["#02040a", fogNear, fogFar]} />

      {/* Vacuum: sun is the only light. */}
      <Sun />

      <Starfield />
      <Earth />

      <MoonTerrain />
      <Player
        fur={fur}
        accent={accent}
        name={name}
        active={active}
        paused={paused}
        onSnapshot={onSnapshot}
        onSpeed={onSpeed}
      />
      <LunarRocks />
      <RemotePlayers />
    </>
  );
}
