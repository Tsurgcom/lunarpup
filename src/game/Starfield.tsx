import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

const STAR_COUNT = 3500;
/** Unit-sphere directions; scaled each frame so stars sit past the mare. */
const STAR_DISTANCE = 2400;

/**
 * Inertial celestial sphere at infinity.
 *
 * Stars are world-axis aligned and recentered on the camera every frame, so
 * there is no motion parallax from skating around the small moon. Overhead at
 * the north pole (+Y) is the opposite sky from the south pole (−Y); turning
 * the board still pans the sky, but translation alone does not whip it around.
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

      const bright = 0.65 + Math.random() * 0.35;
      color.setRGB(bright, bright, bright * (0.92 + Math.random() * 0.08));
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    return { positions, colors };
  }, []);

  useFrame(() => {
    const g = group.current;
    if (!g) return;
    // Keep world orientation (identity); only follow the lens so rays are parallel.
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
          size={1.6}
          sizeAttenuation={false}
          vertexColors
          transparent
          opacity={0.85}
          depthWrite={false}
          fog={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
    </group>
  );
}
