import { Stars } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { DirectionalLight } from "three";
import { MoonTerrain } from "./MoonTerrain";
import { Player } from "./Player";
import { RemotePlayers } from "./RemotePlayers";
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

/** Keep the key light near the viewer so shadows stay useful on infinite ground. */
function FollowSun() {
  const light = useRef<DirectionalLight>(null);
  useFrame(({ camera }) => {
    const sun = light.current;
    if (!sun) return;
    sun.position.set(
      camera.position.x + 40,
      55,
      camera.position.z + 20,
    );
    sun.target.position.set(camera.position.x, 0, camera.position.z);
    sun.target.updateMatrixWorld();
  });
  return (
    <directionalLight
      ref={light}
      castShadow
      intensity={1.35}
      color="#fff4e0"
      shadow-mapSize={[2048, 2048]}
      shadow-camera-far={160}
      shadow-camera-left={-70}
      shadow-camera-right={70}
      shadow-camera-top={70}
      shadow-camera-bottom={-70}
    />
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
  return (
    <>
      <color attach="background" args={["#05070c"]} />
      <fog attach="fog" args={["#05070c", 70, 175]} />

      <ambientLight intensity={0.28} />
      <FollowSun />
      <hemisphereLight args={["#9bb7ff", "#3a342c", 0.35]} />

      <Stars
        radius={180}
        depth={80}
        count={4500}
        factor={3.5}
        saturation={0}
        fade
        speed={0.2}
      />

      <mesh position={[-70, 35, -90]}>
        <sphereGeometry args={[6, 32, 32]} />
        <meshStandardMaterial
          color="#6ea8ff"
          emissive="#1a3a6a"
          emissiveIntensity={0.35}
          roughness={0.7}
        />
      </mesh>
      <mesh position={[-70, 35, -90]}>
        <sphereGeometry args={[6.15, 32, 32]} />
        <meshBasicMaterial color="#8ec5ff" transparent opacity={0.12} />
      </mesh>

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
      <RemotePlayers />
    </>
  );
}
