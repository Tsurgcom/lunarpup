import { forwardRef } from "react";
import type { Group } from "three";

type DogProps = {
  fur?: string;
  accent?: string;
  ghost?: boolean;
};

type MatProps = {
  color: string;
  roughness?: number;
  ghost?: boolean;
};

function DogMat({ color, roughness = 0.85, ghost }: MatProps) {
  return (
    <meshStandardMaterial
      color={color}
      roughness={roughness}
      transparent={ghost}
      opacity={ghost ? 0.38 : 1}
      depthWrite={!ghost}
      emissive={ghost ? "#9bb7ff" : "#000000"}
      emissiveIntensity={ghost ? 0.25 : 0}
    />
  );
}

/** Simple geometric pup on a deck — readable at distance for multiplayer. */
export const SkateDog = forwardRef<Group, DogProps>(function SkateDog(
  { fur = "#d4a574", accent = "#f0c27a", ghost = false },
  ref,
) {
  return (
    <group ref={ref}>
      {/* skateboard */}
      <mesh position={[0, 0.08, 0]} castShadow={!ghost}>
        <boxGeometry args={[0.55, 0.06, 1.35]} />
        <DogMat color="#2c2118" roughness={0.55} ghost={ghost} />
      </mesh>
      <mesh position={[0, 0.11, 0]} castShadow={!ghost}>
        <boxGeometry args={[0.42, 0.02, 1.15]} />
        <DogMat color={accent} roughness={0.4} ghost={ghost} />
      </mesh>
      {[
        [-0.18, 0.04, 0.42],
        [0.18, 0.04, 0.42],
        [-0.18, 0.04, -0.42],
        [0.18, 0.04, -0.42],
      ].map((p, i) => (
        <mesh
          key={i}
          position={p as [number, number, number]}
          rotation={[0, 0, Math.PI / 2]}
          castShadow={!ghost}
        >
          <cylinderGeometry args={[0.08, 0.08, 0.08, 10]} />
          <DogMat color="#1a1a1a" roughness={0.7} ghost={ghost} />
        </mesh>
      ))}

      {/* body */}
      <mesh position={[0, 0.42, 0.05]} castShadow={!ghost}>
        <boxGeometry args={[0.42, 0.32, 0.7]} />
        <DogMat color={fur} ghost={ghost} />
      </mesh>

      {/* head */}
      <mesh position={[0, 0.62, 0.48]} castShadow={!ghost}>
        <boxGeometry args={[0.34, 0.3, 0.34]} />
        <DogMat color={fur} ghost={ghost} />
      </mesh>
      <mesh position={[0, 0.55, 0.68]} castShadow={!ghost}>
        <boxGeometry args={[0.18, 0.12, 0.16]} />
        <DogMat color="#c48b6a" roughness={0.8} ghost={ghost} />
      </mesh>

      {/* ears */}
      <mesh position={[-0.14, 0.8, 0.42]} castShadow={!ghost}>
        <boxGeometry args={[0.1, 0.18, 0.08]} />
        <DogMat color="#b8845c" ghost={ghost} />
      </mesh>
      <mesh position={[0.14, 0.8, 0.42]} castShadow={!ghost}>
        <boxGeometry args={[0.1, 0.18, 0.08]} />
        <DogMat color="#b8845c" ghost={ghost} />
      </mesh>

      {/* eyes */}
      <mesh position={[-0.08, 0.66, 0.64]}>
        <boxGeometry args={[0.06, 0.06, 0.04]} />
        <DogMat color="#1a1410" roughness={0.5} ghost={ghost} />
      </mesh>
      <mesh position={[0.08, 0.66, 0.64]}>
        <boxGeometry args={[0.06, 0.06, 0.04]} />
        <DogMat color="#1a1410" roughness={0.5} ghost={ghost} />
      </mesh>

      {/* legs tucked on board */}
      {[
        [-0.14, 0.22, 0.22],
        [0.14, 0.22, 0.22],
        [-0.14, 0.22, -0.22],
        [0.14, 0.22, -0.22],
      ].map((p, i) => (
        <mesh
          key={`leg-${i}`}
          position={p as [number, number, number]}
          castShadow={!ghost}
        >
          <boxGeometry args={[0.1, 0.16, 0.12]} />
          <DogMat color={fur} ghost={ghost} />
        </mesh>
      ))}

      {/* tail */}
      <mesh
        position={[0, 0.5, -0.42]}
        rotation={[0.4, 0, 0]}
        castShadow={!ghost}
      >
        <boxGeometry args={[0.08, 0.08, 0.28]} />
        <DogMat color={fur} ghost={ghost} />
      </mesh>
    </group>
  );
});
