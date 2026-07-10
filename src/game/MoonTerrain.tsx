import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import {
  CHUNK_RADIUS,
  CHUNK_SIZE,
  CURVATURE_RADIUS,
  chunkOrigin,
  createChunkGeometry,
} from "./terrain";

type ChunkKey = string;

function keyOf(cx: number, cz: number): ChunkKey {
  return `${cx},${cz}`;
}

function parseKey(key: ChunkKey): { cx: number; cz: number } {
  const [sx, sz] = key.split(",");
  return { cx: Number(sx), cz: Number(sz) };
}

/**
 * Infinite lunar surface: streams heightfield chunks around the camera and
 * applies a subtle planetary curvature in the vertex shader so the horizon
 * falls away without affecting physics sampling.
 */
export function MoonTerrain() {
  const group = useRef<THREE.Group>(null);
  const chunks = useRef(new Map<ChunkKey, THREE.Mesh>());
  const center = useRef({ cx: Number.NaN, cz: Number.NaN });
  const viewerUniform = useRef({ value: new THREE.Vector3() });
  const curvatureUniform = useRef({
    value: 1 / (2 * CURVATURE_RADIUS),
  });

  const material = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      color: "#b7b3a8",
      roughness: 0.92,
      metalness: 0.05,
      flatShading: false,
    });

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uViewer = viewerUniform.current;
      shader.uniforms.uCurvature = curvatureUniform.current;
      shader.vertexShader = shader.vertexShader.replace(
        "#include <common>",
        `#include <common>
uniform vec3 uViewer;
uniform float uCurvature;`,
      );
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
{
  vec4 lunarWorld = modelMatrix * vec4(transformed, 1.0);
  float dx = lunarWorld.x - uViewer.x;
  float dz = lunarWorld.z - uViewer.z;
  transformed.y -= uCurvature * (dx * dx + dz * dz);
}`,
      );
    };
    mat.customProgramCacheKey = () => `lunar-curvature-${CURVATURE_RADIUS}`;
    return mat;
  }, []);

  useLayoutEffect(() => {
    return () => {
      for (const mesh of chunks.current.values()) {
        mesh.geometry.dispose();
      }
      chunks.current.clear();
      material.dispose();
    };
  }, [material]);

  useFrame(({ camera }) => {
    viewerUniform.current.value.set(camera.position.x, 0, camera.position.z);

    const cx = Math.floor(camera.position.x / CHUNK_SIZE);
    const cz = Math.floor(camera.position.z / CHUNK_SIZE);
    if (cx === center.current.cx && cz === center.current.cz) return;
    center.current = { cx, cz };

    const root = group.current;
    if (!root) return;

    const needed = new Set<ChunkKey>();
    for (let z = cz - CHUNK_RADIUS; z <= cz + CHUNK_RADIUS; z++) {
      for (let x = cx - CHUNK_RADIUS; x <= cx + CHUNK_RADIUS; x++) {
        needed.add(keyOf(x, z));
      }
    }

    for (const [key, mesh] of chunks.current) {
      if (needed.has(key)) continue;
      root.remove(mesh);
      mesh.geometry.dispose();
      chunks.current.delete(key);
    }

    for (const key of needed) {
      if (chunks.current.has(key)) continue;
      const { cx: x, cz: z } = parseKey(key);
      const geometry = createChunkGeometry(x, z, 40);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.receiveShadow = true;
      mesh.castShadow = true;
      const origin = chunkOrigin(x, z);
      mesh.position.set(origin.x, 0, origin.z);
      root.add(mesh);
      chunks.current.set(key, mesh);
    }
  });

  return <group ref={group} />;
}
