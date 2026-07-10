import { forwardRef } from "react";
import type { Group } from "three";

type DogProps = {
  fur?: string;
  accent?: string;
};

/** Simple geometric pup on a deck — readable at distance for multiplayer. */
export const SkateDog = forwardRef<Group, DogProps>(function SkateDog(
  { fur = "#d4a574", accent = "#f0c27a" },
  ref,
) {
  return (
    <group ref={ref}>
      {/* skateboard */}
      <mesh position={[0, 0.08, 0]} castShadow>
        <boxGeometry args={[0.55, 0.06, 1.35]} />
        <meshStandardMaterial color="#2c2118" roughness={0.55} />
      </mesh>
      <mesh position={[0, 0.11, 0]} castShadow>
        <boxGeometry args={[0.42, 0.02, 1.15]} />
        <meshStandardMaterial color={accent} roughness={0.4} />
      </mesh>
      {[
        [-0.18, 0.04, 0.42],
        [0.18, 0.04, 0.42],
        [-0.18, 0.04, -0.42],
        [0.18, 0.04, -0.42],
      ].map((p, i) => (
        <mesh key={i} position={p as [number, number, number]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.08, 0.08, 0.08, 10]} />
          <meshStandardMaterial color="#1a1a1a" roughness={0.7} />
        </mesh>
      ))}

      {/* body */}
      <mesh position={[0, 0.42, 0.05]} castShadow>
        <boxGeometry args={[0.42, 0.32, 0.7]} />
        <meshStandardMaterial color={fur} roughness={0.85} />
      </mesh>

      {/* head */}
      <mesh position={[0, 0.62, 0.48]} castShadow>
        <boxGeometry args={[0.34, 0.3, 0.34]} />
        <meshStandardMaterial color={fur} roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.55, 0.68]} castShadow>
        <boxGeometry args={[0.18, 0.12, 0.16]} />
        <meshStandardMaterial color="#c48b6a" roughness={0.8} />
      </mesh>

      {/* ears */}
      <mesh position={[-0.14, 0.8, 0.42]} castShadow>
        <boxGeometry args={[0.1, 0.18, 0.08]} />
        <meshStandardMaterial color="#b8845c" roughness={0.85} />
      </mesh>
      <mesh position={[0.14, 0.8, 0.42]} castShadow>
        <boxGeometry args={[0.1, 0.18, 0.08]} />
        <meshStandardMaterial color="#b8845c" roughness={0.85} />
      </mesh>

      {/* eyes */}
      <mesh position={[-0.08, 0.66, 0.64]}>
        <boxGeometry args={[0.06, 0.06, 0.04]} />
        <meshStandardMaterial color="#1a1410" />
      </mesh>
      <mesh position={[0.08, 0.66, 0.64]}>
        <boxGeometry args={[0.06, 0.06, 0.04]} />
        <meshStandardMaterial color="#1a1410" />
      </mesh>

      {/* legs tucked on board */}
      {[
        [-0.14, 0.22, 0.22],
        [0.14, 0.22, 0.22],
        [-0.14, 0.22, -0.22],
        [0.14, 0.22, -0.22],
      ].map((p, i) => (
        <mesh key={`leg-${i}`} position={p as [number, number, number]} castShadow>
          <boxGeometry args={[0.1, 0.16, 0.12]} />
          <meshStandardMaterial color={fur} roughness={0.85} />
        </mesh>
      ))}

      {/* tail */}
      <mesh position={[0, 0.5, -0.42]} rotation={[0.4, 0, 0]} castShadow>
        <boxGeometry args={[0.08, 0.08, 0.28]} />
        <meshStandardMaterial color={fur} roughness={0.85} />
      </mesh>
    </group>
  );
});
