import { useSyncExternalStore } from "react";
import { MOON_RADIUS } from "./moon";
import { getPerfSettings, subscribePerf } from "./performanceTiers";

/** Decorative moon — plain sphere, inset under streamed chunks. */
export function StaticMoon() {
  const { moonWidthSegs, moonHeightSegs } = useSyncExternalStore(
    subscribePerf,
    getPerfSettings,
    getPerfSettings,
  );

  // Sit well below the deepest bowls so the backdrop never fills a crater.
  return (
    <mesh receiveShadow castShadow scale={0.9}>
      <sphereGeometry
        key={`${moonWidthSegs}x${moonHeightSegs}`}
        args={[MOON_RADIUS, moonWidthSegs, moonHeightSegs]}
      />
      <meshStandardMaterial
        color="#2a2438"
        metalness={0.02}
        roughness={0.95}
        fog
      />
    </mesh>
  );
}
