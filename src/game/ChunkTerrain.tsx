import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import {
  cancelStaleFaceBuilds,
  faceBuildKey,
  getChunkQueueDepth,
  getChunkWorkerCount,
  requestFaceGeometry,
  resetChunkBuildQueue,
} from "./chunkBuild";
import { setChunkHeightSampler } from "./chunkGeometry";
import {
  getChunkLodSnapshot,
  getIcoFaces,
  type IcoFace,
  sampleTerrainHeight,
} from "./chunkLod";
import { isDebugEnabled } from "./debugFrame";
import { createMoonMaterial } from "./moonMaterial";

type FaceMesh = {
  mesh: THREE.Mesh;
  subdiv: number;
};

type PendingAttach = {
  face: IcoFace;
  subdiv: number;
  key: string;
  geometry: THREE.BufferGeometry;
};

const EMPTY_GEO = new THREE.BufferGeometry();
const MAX_ATTACH_PER_FRAME = 3;

let debugQueue = 0;
let debugWorkers = 0;

/** ?debug: pending + inflight chunk builds. */
export function getDebugChunkQueue(): number {
  return debugQueue;
}

/** ?debug: live worker pool size (0 = sync fallback). */
export function getDebugChunkWorkers(): number {
  return debugWorkers;
}

/**
 * Streams icosphere face patches from the LOD plan via a multi-worker pool.
 *
 * Rebuild policy: when subdiv changes, the old mesh is removed immediately
 * and a fresh build is queued — no “keep previous LOD while recovering”.
 */
export function ChunkTerrain() {
  const group = useRef<THREE.Group>(null);
  const meshes = useRef(new Map<number, FaceMesh>());
  const geoCache = useRef(new Map<string, THREE.BufferGeometry>());
  const meshPool = useRef<THREE.Mesh[]>([]);
  const liveKeys = useRef(new Set<string>());
  const requested = useRef(new Set<string>());
  const attachQueue = useRef<PendingAttach[]>([]);
  const viewer = useRef(new THREE.Vector3(0, 0, 1));
  const debugOn = useRef(isDebugEnabled());

  const material = useMemo(() => createMoonMaterial(), []);

  useLayoutEffect(() => {
    getIcoFaces();
    // Main-thread sampler follows the registered terrain generator API.
    setChunkHeightSampler(sampleTerrainHeight);
    return () => {
      for (const entry of meshes.current.values()) {
        group.current?.remove(entry.mesh);
        releaseMesh(entry.mesh, meshPool.current);
      }
      meshes.current.clear();
      for (const mesh of meshPool.current) disposeMeshTree(mesh);
      meshPool.current.length = 0;
      for (const geo of geoCache.current.values()) geo.dispose();
      geoCache.current.clear();
      requested.current.clear();
      attachQueue.current.length = 0;
      resetChunkBuildQueue();
      material.dispose();
    };
  }, [material]);

  useFrame(() => {
    const root = group.current;
    if (!root) return;

    const snap = getChunkLodSnapshot();
    const faces = getIcoFaces();
    viewer.current.set(snap.viewerX, snap.viewerY, snap.viewerZ);

    const live = liveKeys.current;
    live.clear();

    const needed = new Set<number>();
    for (const c of snap.chunks) needed.add(c.faceIndex);

    // Evict faces that left the cull set — rebuild later if they return.
    for (const [id, entry] of meshes.current) {
      if (needed.has(id)) continue;
      root.remove(entry.mesh);
      releaseMesh(entry.mesh, meshPool.current);
      meshes.current.delete(id);
    }

    for (const c of snap.chunks) {
      const face = faces[c.faceIndex];
      if (!face) continue;
      const key = faceBuildKey(c.faceIndex, c.subdiv);
      live.add(key);

      const existing = meshes.current.get(c.faceIndex);
      if (existing && existing.subdiv === c.subdiv) continue;

      // Don't recover — drop the wrong LOD and rebuild from scratch.
      if (existing) {
        root.remove(existing.mesh);
        releaseMesh(existing.mesh, meshPool.current);
        meshes.current.delete(c.faceIndex);
      }

      const geometry = geoCache.current.get(key);
      if (!geometry) {
        if (!requested.current.has(key)) {
          requested.current.add(key);
          const priority = face.centroid.dot(viewer.current) * 1000 + c.subdiv;
          void requestFaceGeometry(face, c.subdiv, priority)
            .then((geo) => {
              if (!geoCache.current.has(key)) {
                geoCache.current.set(key, geo);
                attachQueue.current.push({
                  face,
                  subdiv: c.subdiv,
                  key,
                  geometry: geo,
                });
              } else {
                geo.dispose();
              }
            })
            .catch((err: unknown) => {
              requested.current.delete(key);
              if (err instanceof DOMException && err.name === "AbortError") {
                return;
              }
              console.warn("chunk face build failed", err);
            });
        }
        continue;
      }

      if (!attachQueue.current.some((p) => p.key === key)) {
        attachQueue.current.push({
          face,
          subdiv: c.subdiv,
          key,
          geometry,
        });
      }
    }

    cancelStaleFaceBuilds(live);

    let attached = 0;
    while (attached < MAX_ATTACH_PER_FRAME && attachQueue.current.length > 0) {
      const next = attachQueue.current.shift()!;
      if (!live.has(next.key)) continue;
      if (!geoCache.current.has(next.key)) continue;
      const existing = meshes.current.get(next.face.index);
      if (existing && existing.subdiv === next.subdiv) continue;
      if (existing) {
        root.remove(existing.mesh);
        releaseMesh(existing.mesh, meshPool.current);
        meshes.current.delete(next.face.index);
      }
      attachMesh(
        next.face,
        next.subdiv,
        next.geometry,
        root,
        material,
        meshes.current,
        meshPool.current,
      );
      attached++;
    }

    for (const [key, geo] of geoCache.current) {
      if (live.has(key)) continue;
      if (attachQueue.current.some((p) => p.key === key)) continue;
      geo.dispose();
      geoCache.current.delete(key);
      requested.current.delete(key);
    }

    if (debugOn.current) {
      debugQueue = getChunkQueueDepth();
      debugWorkers = getChunkWorkerCount();
    }
  });

  return <group ref={group} />;
}

function releaseMesh(mesh: THREE.Mesh, pool: THREE.Mesh[]): void {
  mesh.geometry = EMPTY_GEO;
  pool.push(mesh);
}

function disposeMeshTree(mesh: THREE.Mesh): void {
  mesh.geometry = EMPTY_GEO;
}

function attachMesh(
  face: IcoFace,
  subdiv: number,
  geometry: THREE.BufferGeometry,
  root: THREE.Group,
  material: THREE.Material,
  meshes: Map<number, FaceMesh>,
  pool: THREE.Mesh[],
): void {
  let mesh = pool.pop();
  if (!mesh) {
    mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
  } else {
    mesh.geometry = geometry;
    mesh.material = material;
    mesh.receiveShadow = true;
    mesh.castShadow = false;
  }
  root.add(mesh);
  meshes.set(face.index, { mesh, subdiv });
}
