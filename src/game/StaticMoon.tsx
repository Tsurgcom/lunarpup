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

  return (
    <mesh receiveShadow castShadow scale={0.995}>
      <sphereGeometry
        key={`${moonWidthSegs}x${moonHeightSegs}`}
        args={[MOON_RADIUS, moonWidthSegs, moonHeightSegs]}
      />
      <meshStandardMaterial
        color="#b8a990"
        metalness={0.02}
        roughness={0.88}
        fog
      />
    </mesh>
  );
}
