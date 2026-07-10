import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { createMoonMaterial } from "./moonMaterial";
import {
  createFaceGeometry,
  faceSubdiv,
  facesNear,
  getIcoFaces,
  type IcoFace,
} from "./terrain";

type FaceMesh = {
  mesh: THREE.Mesh;
  lod: number;
};

/**
 * Spherical clipmap: streams icosphere face patches around the camera and
 * retessellates by geodesic distance so near-field geometry matches the
 * analytic heightfield used by collisions.
 */
export function MoonTerrain() {
  const group = useRef<THREE.Group>(null);
  const meshes = useRef(new Map<number, FaceMesh>());
  const geoCache = useRef(new Map<string, THREE.BufferGeometry>());
  const viewerDir = useRef(new THREE.Vector3(0, 0, 1));

  const material = useMemo(() => createMoonMaterial(), []);

  useLayoutEffect(() => {
    getIcoFaces();
    return () => {
      for (const entry of meshes.current.values()) {
        group.current?.remove(entry.mesh);
      }
      meshes.current.clear();
      for (const geo of geoCache.current.values()) geo.dispose();
      geoCache.current.clear();
      material.dispose();
    };
  }, [material]);

  useFrame(({ camera }) => {
    const dir = viewerDir.current;
    dir.copy(camera.position);
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
    else dir.normalize();

    const root = group.current;
    if (!root) return;

    const needed = facesNear(dir);
    const neededIds = new Set(needed.map((f) => f.index));

    for (const [id, entry] of meshes.current) {
      if (neededIds.has(id)) continue;
      root.remove(entry.mesh);
      meshes.current.delete(id);
    }

    for (const face of needed) {
      const lod = faceSubdiv(dir, face);
      const existing = meshes.current.get(face.index);
      if (existing && existing.lod === lod) continue;
      if (existing) {
        root.remove(existing.mesh);
        meshes.current.delete(face.index);
      }
      ensureMesh(face, lod, root, material, meshes.current, geoCache.current);
    }
  });

  return <group ref={group} />;
}

function geoKey(faceIndex: number, lod: number): string {
  return `${faceIndex}:${lod}`;
}

function ensureMesh(
  face: IcoFace,
  lod: number,
  root: THREE.Group,
  material: THREE.Material,
  meshes: Map<number, FaceMesh>,
  geoCache: Map<string, THREE.BufferGeometry>,
): void {
  const key = geoKey(face.index, lod);
  let geometry = geoCache.get(key);
  if (!geometry) {
    geometry = createFaceGeometry(face, lod);
    geoCache.set(key, geometry);
  }
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  // Don't self-shadow the crust — ortho depth acne draws stripe lines on
  // bowls. Crater shading is sun-synced in the material instead; the pup
  // still casts onto the surface via receiveShadow.
  mesh.castShadow = false;
  root.add(mesh);
  meshes.set(face.index, { mesh, lod });
}
