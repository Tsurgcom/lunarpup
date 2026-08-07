import { MOON_RADIUS } from "./moon";

/**
 * Decorative moon — plain sphere, inset under streamed chunks.
 * Fixed segment count: remounting on every adaptive tier climb was a
 * needless GPU upload hitch (worse than the segs it saved on Low).
 */
export function StaticMoon() {
  // Sit well below the deepest bowls so the backdrop never fills a crater.
  return (
    <mesh receiveShadow castShadow scale={0.9}>
      <sphereGeometry args={[MOON_RADIUS, 48, 36]} />
      <meshStandardMaterial
        color="#242428"
        metalness={0}
        roughness={0.98}
        fog
      />
    </mesh>
  );
}
