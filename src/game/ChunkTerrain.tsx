import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { ChunkBatchManager } from "./chunkBatch";
import {
  cancelStaleFaceBuilds,
  drainChunkBuildResults,
  faceBuildKey,
  getChunkQueueDepth,
  getChunkWorkerCount,
  requestFaceGeometry,
  resetChunkBuildQueue,
  warmChunkWorkers,
} from "./chunkBuild";
import { setChunkHeightSampler } from "./chunkGeometry";
import { getChunkLodSnapshot, getIcoFaces, type IcoFace } from "./chunkLod";
import { isDebugEnabled } from "./debugFrame";
import { sampleHeightDir } from "./lunarTerrain";
import { createMoonMaterial, syncMoonMaterialTier } from "./moonMaterial";
import { getPerfSettings } from "./performanceTiers";

type PendingAttach = {
  face: IcoFace;
  subdiv: number;
  key: string;
  geometry: THREE.BufferGeometry;
  priority: number;
};

/** Keep departing faces for a few frames to absorb view-cull flicker. */
const EVICT_GRACE_FRAMES = 10;

/** Cap GPU dispose work per frame (dispose can stall the driver). */
const MAX_DISPOSE_PER_FRAME = 1;

/**
 * Retain cold geometries so skating back over recent ground is free.
 * Map insertion order = LRU (re-touch moves to the end).
 */
const GEO_CACHE_MAX = 128;

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

function touchGeo(
  cache: Map<string, THREE.BufferGeometry>,
  key: string,
  geo: THREE.BufferGeometry,
): void {
  if (cache.get(key) === geo) {
    cache.delete(key);
  }
  cache.set(key, geo);
}

/**
 * Streams icosphere face patches from the LOD plan via a multi-worker pool,
 * merging same-subdiv faces into LOD-ring batched meshes (~4 draw calls).
 *
 * Rebuild policy: when subdiv changes (up or down), keep the previous slice
 * until the new LOD geometry is built — then swap atomically.
 */
export function ChunkTerrain() {
  const group = useRef<THREE.Group>(null);
  const batches = useRef<ChunkBatchManager | null>(null);
  const geoCache = useRef(new Map<string, THREE.BufferGeometry>());
  const liveKeys = useRef(new Set<string>());
  const needed = useRef(new Set<number>());
  const requested = useRef(new Set<string>());
  const attachQueue = useRef<PendingAttach[]>([]);
  const attachQueued = useRef(new Set<string>());
  const evictionGrace = useRef(new Map<number, number>());
  const lastChunks = useRef<readonly { faceIndex: number; subdiv: number }[]>(
    [],
  );
  const viewer = useRef(new THREE.Vector3(0, 0, 1));
  const debugOn = useRef(isDebugEnabled());
  const lastTier = useRef(-1);

  const material = useMemo(() => createMoonMaterial(), []);

  useLayoutEffect(() => {
    getIcoFaces();
    // Main-thread sync fallback (workers register their own sampler).
    setChunkHeightSampler(sampleHeightDir);
    warmChunkWorkers();
    const root = group.current;
    if (root) {
      batches.current = new ChunkBatchManager(root, material);
    }
    return () => {
      batches.current?.dispose();
      batches.current = null;
      for (const geo of geoCache.current.values()) geo.dispose();
      geoCache.current.clear();
      requested.current.clear();
      attachQueue.current.length = 0;
      attachQueued.current.clear();
      evictionGrace.current.clear();
      resetChunkBuildQueue();
      material.dispose();
    };
  }, [material]);

  useFrame(() => {
    const root = group.current;
    if (!root) return;
    if (!batches.current) {
      batches.current = new ChunkBatchManager(root, material);
    }
    const batch = batches.current;

    const perf = getPerfSettings();
    if (perf.tier !== lastTier.current) {
      lastTier.current = perf.tier;
      syncMoonMaterialTier(material, perf);
    }

    const budget = perf.maxChunkAttachPerFrame;
    // Spread BufferGeometry wraps across frames — worker onmessage used to
    // hitch when several builds finished in the same turn.
    drainChunkBuildResults(budget);

    const snap = getChunkLodSnapshot();
    const faces = getIcoFaces();
    viewer.current.set(snap.viewerX, snap.viewerY, snap.viewerZ);

    const planChanged = snap.chunks !== lastChunks.current;
    lastChunks.current = snap.chunks;

    const live = liveKeys.current;
    live.clear();

    const need = needed.current;
    need.clear();
    for (const c of snap.chunks) need.add(c.faceIndex);

    // Evict faces that left the cull set — grace absorbs orbit flicker.
    // Snapshot first: detach mutates the live-face map.
    const resident = [...batch.liveFaces()];
    for (const [id, subdiv] of resident) {
      if (need.has(id)) {
        evictionGrace.current.delete(id);
        continue;
      }
      const left = evictionGrace.current.get(id) ?? EVICT_GRACE_FRAMES;
      if (left > 0) {
        evictionGrace.current.set(id, left - 1);
        live.add(faceBuildKey(id, subdiv));
        continue;
      }
      evictionGrace.current.delete(id);
      batch.detach(id);
    }

    if (planChanged) {
      for (const c of snap.chunks) {
        const face = faces[c.faceIndex];
        if (!face) continue;
        const key = faceBuildKey(c.faceIndex, c.subdiv);
        live.add(key);

        if (batch.has(c.faceIndex, c.subdiv)) {
          const cached = geoCache.current.get(key);
          if (cached) touchGeo(geoCache.current, key, cached);
          continue;
        }

        // Keep showing the previous LOD until the new slice is ready.
        const existingSubdiv = batch.getSubdiv(c.faceIndex);
        if (existingSubdiv !== undefined) {
          live.add(faceBuildKey(c.faceIndex, existingSubdiv));
        }

        const priority = face.centroid.dot(viewer.current) * 1000 + c.subdiv;
        const geometry = geoCache.current.get(key);
        if (!geometry) {
          if (!requested.current.has(key)) {
            requested.current.add(key);
            void requestFaceGeometry(face, c.subdiv, priority)
              .then((geo) => {
                if (!geoCache.current.has(key)) {
                  touchGeo(geoCache.current, key, geo);
                  enqueueAttach(attachQueue.current, attachQueued.current, {
                    face,
                    subdiv: c.subdiv,
                    key,
                    geometry: geo,
                    priority,
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

        touchGeo(geoCache.current, key, geometry);
        enqueueAttach(attachQueue.current, attachQueued.current, {
          face,
          subdiv: c.subdiv,
          key,
          geometry,
          priority,
        });
      }
    } else {
      // Plan stable — still mark live keys for cache / cancel bookkeeping.
      for (const c of snap.chunks) {
        const key = faceBuildKey(c.faceIndex, c.subdiv);
        live.add(key);
        const cached = geoCache.current.get(key);
        if (cached) touchGeo(geoCache.current, key, cached);
        const existingSubdiv = batch.getSubdiv(c.faceIndex);
        if (existingSubdiv !== undefined && existingSubdiv !== c.subdiv) {
          live.add(faceBuildKey(c.faceIndex, existingSubdiv));
        }
      }
    }

    cancelStaleFaceBuilds(live);

    let attached = 0;
    while (attached < budget && attachQueue.current.length > 0) {
      const next = attachQueue.current.shift()!;
      attachQueued.current.delete(next.key);
      if (!live.has(next.key)) continue;
      if (!geoCache.current.has(next.key)) continue;
      if (batch.has(next.face.index, next.subdiv)) continue;
      batch.attach(next.face.index, next.subdiv, next.geometry);
      attached++;
    }

    // LRU trim — keep cold patches around; only dispose when over budget.
    let disposed = 0;
    if (geoCache.current.size > GEO_CACHE_MAX) {
      for (const [key, geo] of geoCache.current) {
        if (disposed >= MAX_DISPOSE_PER_FRAME) break;
        if (geoCache.current.size <= GEO_CACHE_MAX) break;
        if (live.has(key)) continue;
        if (attachQueued.current.has(key)) continue;
        geo.dispose();
        geoCache.current.delete(key);
        requested.current.delete(key);
        disposed++;
      }
    }

    if (debugOn.current) {
      debugQueue = getChunkQueueDepth();
      debugWorkers = getChunkWorkerCount();
    }
  });

  return <group ref={group} />;
}

function enqueueAttach(
  queue: PendingAttach[],
  queued: Set<string>,
  item: PendingAttach,
): void {
  if (queued.has(item.key)) return;
  queued.add(item.key);
  // Insert by priority (near / dense first) without a full sort each push.
  let i = queue.length;
  while (i > 0 && queue[i - 1]!.priority < item.priority) i--;
  queue.splice(i, 0, item);
}
