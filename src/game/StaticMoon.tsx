import { MOON_RADIUS } from "./moon";

/** Decorative moon — plain sphere, no heightfield. */
export function StaticMoon() {
  return (
    <mesh receiveShadow castShadow>
      <sphereGeometry args={[MOON_RADIUS, 64, 48]} />
      <meshStandardMaterial
        color="#b8a990"
        metalness={0.02}
        roughness={0.88}
        fog
      />
    </mesh>
  );
}
