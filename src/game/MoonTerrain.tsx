import { useMemo } from "react";
import { createMoonGeometry } from "./terrain";

export function MoonTerrain() {
  const geometry = useMemo(() => createMoonGeometry(200), []);

  return (
    <mesh geometry={geometry} receiveShadow castShadow>
      <meshStandardMaterial
        color="#b7b3a8"
        roughness={0.92}
        metalness={0.05}
        flatShading={false}
      />
    </mesh>
  );
}
