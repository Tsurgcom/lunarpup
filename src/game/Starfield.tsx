import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

const STAR_COUNT = 900;
const STAR_DISTANCE = 4800;

/**
 * Soft, sparse starfield — pastel points, no dense photoreal milky way.
 */
export function Starfield() {
  const group = useRef<THREE.Group>(null);
  const { camera } = useThree();

  const { positions, colors } = useMemo(() => {
    const positions = new Float32Array(STAR_COUNT * 3);
    const colors = new Float32Array(STAR_COUNT * 3);
    const color = new THREE.Color();
    const spherical = new THREE.Spherical();
    const vec = new THREE.Vector3();
    const tints = ["#ffffff", "#ffe9a8", "#c8e0ff", "#ffd6e8", "#b8f0e0"];

    for (let i = 0; i < STAR_COUNT; i++) {
      spherical.set(
        1,
        Math.acos(1 - Math.random() * 2),
        Math.random() * Math.PI * 2,
      );
      vec.setFromSpherical(spherical).multiplyScalar(STAR_DISTANCE);
      positions[i * 3] = vec.x;
      positions[i * 3 + 1] = vec.y;
      positions[i * 3 + 2] = vec.z;

      color.set(tints[i % tints.length]!);
      const bright = 0.55 + Math.random() * 0.45;
      colors[i * 3] = color.r * bright;
      colors[i * 3 + 1] = color.g * bright;
      colors[i * 3 + 2] = color.b * bright;
    }
    return { positions, colors };
  }, []);

  // Stars only track the camera — keep priority ≤ 0 so R3F auto-renders.
  useFrame(() => {
    const g = group.current;
    if (!g) return;
    g.position.copy(camera.position);
    g.quaternion.identity();
  });

  return (
    <group ref={group}>
      <points frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
          <bufferAttribute attach="attributes-color" args={[colors, 3]} />
        </bufferGeometry>
        <pointsMaterial
          size={2.4}
          sizeAttenuation={false}
          vertexColors
          transparent
          opacity={0.9}
          depthWrite={false}
          fog={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
    </group>
  );
}
