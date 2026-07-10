import { Stars } from "@react-three/drei";
import { useRef } from "react";
import type { DirectionalLight } from "three";
import { MoonTerrain } from "./MoonTerrain";
import { Player } from "./Player";
import { RemotePlayers } from "./RemotePlayers";
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

/** Fixed key light — moon-centered world, sun stays put. */
function Sun() {
  const light = useRef<DirectionalLight>(null);
  return (
    <directionalLight
      ref={light}
      castShadow
      intensity={1.35}
      color="#fff4e0"
      position={[MOON_RADIUS * 2.2, MOON_RADIUS * 1.6, MOON_RADIUS * 1.1]}
      shadow-mapSize={[2048, 2048]}
      shadow-camera-far={MOON_RADIUS * 6}
      shadow-camera-left={-MOON_RADIUS}
      shadow-camera-right={MOON_RADIUS}
      shadow-camera-top={MOON_RADIUS}
      shadow-camera-bottom={-MOON_RADIUS}
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
  const fogNear = MOON_RADIUS * 0.55;
  const fogFar = MOON_RADIUS * 2.4;

  return (
    <>
      <color attach="background" args={["#05070c"]} />
      <fog attach="fog" args={["#05070c", fogNear, fogFar]} />

      <ambientLight intensity={0.28} />
      <Sun />
      <hemisphereLight args={["#9bb7ff", "#3a342c", 0.35]} />

      <Stars
        radius={MOON_RADIUS * 4}
        depth={MOON_RADIUS * 1.5}
        count={4500}
        factor={3.5}
        saturation={0}
        fade
        speed={0.2}
      />

      <mesh position={[-MOON_RADIUS * 1.8, MOON_RADIUS * 0.9, -MOON_RADIUS * 2]}>
        <sphereGeometry args={[6, 32, 32]} />
        <meshStandardMaterial
          color="#6ea8ff"
          emissive="#1a3a6a"
          emissiveIntensity={0.35}
          roughness={0.7}
        />
      </mesh>
      <mesh position={[-MOON_RADIUS * 1.8, MOON_RADIUS * 0.9, -MOON_RADIUS * 2]}>
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
