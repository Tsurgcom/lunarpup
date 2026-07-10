import { Stars } from "@react-three/drei";
import { MoonTerrain } from "./MoonTerrain";
import { Player } from "./Player";
import { RemotePlayers } from "./RemotePlayers";
import type { PlayerSnapshot } from "./types";

type WorldProps = {
  fur: string;
  accent: string;
  name: string;
  onSnapshot: (snap: PlayerSnapshot) => void;
  onSpeed: (speed: number) => void;
};

export function World({ fur, accent, name, onSnapshot, onSpeed }: WorldProps) {
  return (
    <>
      <color attach="background" args={["#05070c"]} />
      <fog attach="fog" args={["#05070c", 60, 140]} />

      <ambientLight intensity={0.28} />
      <directionalLight
        castShadow
        position={[40, 55, 20]}
        intensity={1.35}
        color="#fff4e0"
        shadow-mapSize={[2048, 2048]}
        shadow-camera-far={120}
        shadow-camera-left={-50}
        shadow-camera-right={50}
        shadow-camera-top={50}
        shadow-camera-bottom={-50}
      />
      <hemisphereLight args={["#9bb7ff", "#3a342c", 0.35]} />

      <Stars
        radius={120}
        depth={60}
        count={4000}
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
        onSnapshot={onSnapshot}
        onSpeed={onSpeed}
      />
      <RemotePlayers />
    </>
  );
}
