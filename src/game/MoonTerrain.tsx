import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import {
  CHUNK_RADIUS,
  CHUNK_SIZE,
  CURVATURE_RADIUS,
  MOON_CHUNKS,
  MOON_HALF,
  chunkOrigin,
  createChunkGeometry,
  wrapChunk,
} from "./terrain";

type SlotKey = string;

function keyOf(sx: number, sz: number): SlotKey {
  return `${sx},${sz}`;
}

function parseKey(key: SlotKey): { sx: number; sz: number } {
  const [a, b] = key.split(",");
  return { sx: Number(a), sz: Number(b) };
}

/**
 * Finite toroidal lunar surface: streams chunk slots around the camera,
 * reuses wrapped logical geometries for seam ghosts, and applies gentle
 * planetary curvature in the vertex shader.
 */
export function MoonTerrain() {
  const group = useRef<THREE.Group>(null);
  const meshes = useRef(new Map<SlotKey, THREE.Mesh>());
  const geoCache = useRef(new Map<string, THREE.BufferGeometry>());
  const center = useRef({ sx: Number.NaN, sz: Number.NaN });
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
      shader.uniforms.uMoonSize = { value: MOON_CHUNKS * CHUNK_SIZE };
      shader.vertexShader = shader.vertexShader.replace(
        "#include <common>",
        `#include <common>
uniform vec3 uViewer;
uniform float uCurvature;
uniform float uMoonSize;

float wrapDelta(float a, float b, float size) {
  float d = a - b;
  return d - size * floor(d / size + 0.5);
}`,
      );
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
{
  vec4 lunarWorld = modelMatrix * vec4(transformed, 1.0);
  float dx = wrapDelta(lunarWorld.x, uViewer.x, uMoonSize);
  float dz = wrapDelta(lunarWorld.z, uViewer.z, uMoonSize);
  transformed.y -= uCurvature * (dx * dx + dz * dz);
}`,
      );
    };
    mat.customProgramCacheKey = () =>
      `lunar-curvature-wrap-${CURVATURE_RADIUS}-${MOON_CHUNKS}`;
    return mat;
  }, []);

  useLayoutEffect(() => {
    return () => {
      for (const mesh of meshes.current.values()) {
        group.current?.remove(mesh);
      }
      meshes.current.clear();
      for (const geo of geoCache.current.values()) geo.dispose();
      geoCache.current.clear();
      material.dispose();
    };
  }, [material]);

  useFrame(({ camera }) => {
    // Continuous viewer — do not wrap. Chunks stream on the unwrap sheet so
    // skating past the seam stays smooth (height still tiles toroidally).
    viewerUniform.current.value.set(camera.position.x, 0, camera.position.z);

    const sx = Math.floor((camera.position.x + MOON_HALF) / CHUNK_SIZE);
    const sz = Math.floor((camera.position.z + MOON_HALF) / CHUNK_SIZE);
    if (sx === center.current.sx && sz === center.current.sz) return;
    center.current = { sx, sz };

    const root = group.current;
    if (!root) return;

    const needed = new Set<SlotKey>();
    for (let z = sz - CHUNK_RADIUS; z <= sz + CHUNK_RADIUS; z++) {
      for (let x = sx - CHUNK_RADIUS; x <= sx + CHUNK_RADIUS; x++) {
        needed.add(keyOf(x, z));
      }
    }

    for (const [key, mesh] of meshes.current) {
      if (needed.has(key)) continue;
      root.remove(mesh);
      meshes.current.delete(key);
    }

    for (const key of needed) {
      if (meshes.current.has(key)) continue;
      const { sx: slotX, sz: slotZ } = parseKey(key);
      const logicalX = wrapChunk(slotX);
      const logicalZ = wrapChunk(slotZ);
      const geoKey = `${logicalX},${logicalZ}`;
      let geometry = geoCache.current.get(geoKey);
      if (!geometry) {
        geometry = createChunkGeometry(logicalX, logicalZ, 40);
        geoCache.current.set(geoKey, geometry);
      }
      const mesh = new THREE.Mesh(geometry, material);
      mesh.receiveShadow = true;
      mesh.castShadow = true;
      const origin = chunkOrigin(slotX, slotZ);
      mesh.position.set(origin.x, 0, origin.z);
      root.add(mesh);
      meshes.current.set(key, mesh);
    }
  });

  return <group ref={group} />;
}
