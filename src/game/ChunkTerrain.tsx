import { useFrame, useThree } from "@react-three/fiber";
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
import { faceIntersectsFrustum, updateCameraFrustum } from "./chunkFrustum";
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

/** Keep departing faces for a few frames to absorb stream-cull flicker. */
const EVICT_GRACE_FRAMES = 10;

/**
 * Extra frames a face stays GPU-resident after leaving the camera frustum.
 * Softens orbit flicker without keeping off-screen patches forever.
 */
const FRUSTUM_EXIT_GRACE_FRAMES = 12;

/** useFrame with the default pre-render pass (≤0). Mounted after Player so
 *  CameraRig's matrices are already updated this frame. Priority >0 would
 *  take over the render-loop and must call gl.render() manually — don't. */
const TERRAIN_FRAME_PRIORITY = 0;

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
 *
 * GPU residency is filtered by the chase-camera frustum (not board-forward).
 * The LOD stream plan stays pup/horizon-centric so orbiting never remeshes.
 */
export function ChunkTerrain() {
  const group = useRef<THREE.Group>(null);
  const camera = useThree((s) => s.camera);
  const batches = useRef<ChunkBatchManager | null>(null);
  const geoCache = useRef(new Map<string, THREE.BufferGeometry>());
  const liveKeys = useRef(new Set<string>());
  const drawNeeded = useRef(new Set<number>());
  const requested = useRef(new Set<string>());
  const attachQueue = useRef<PendingAttach[]>([]);
  const attachQueued = useRef(new Set<string>());
  const streamGrace = useRef(new Map<number, number>());
  const frustumGrace = useRef(new Map<number, number>());
  const lastChunks = useRef<readonly { faceIndex: number; subdiv: number }[]>(
    [],
  );
  const viewer = useRef(new THREE.Vector3(0, 0, 1));
  const frustum = useRef(new THREE.Frustum());
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
      streamGrace.current.clear();
      frustumGrace.current.clear();
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

    // Keep wrap + attach + compact on separate budgets so one frame never
    // pays for a remesh storm the way unbounded sync pump() used to.
    const budget = perf.maxChunkAttachPerFrame;
    const wrapBudget = Math.max(1, Math.min(2, budget));
    drainChunkBuildResults(wrapBudget);

    const snap = getChunkLodSnapshot();
    const faces = getIcoFaces();
    viewer.current.set(snap.viewerX, snap.viewerY, snap.viewerZ);
    updateCameraFrustum(camera, frustum.current);

    const planChanged = snap.chunks !== lastChunks.current;
    lastChunks.current = snap.chunks;

    const live = liveKeys.current;
    live.clear();

    // Draw set = streamed ∩ camera frustum (with exit hysteresis).
    // Prefetch still covers the full stream plan so orbit reattach is free.
    const draw = drawNeeded.current;
    draw.clear();
    const planIds = new Set<number>();
    const frustumVisible = new Set<number>();
    for (const c of snap.chunks) {
      planIds.add(c.faceIndex);
      const face = faces[c.faceIndex];
      if (!face) continue;
      if (faceIntersectsFrustum(face, frustum.current)) {
        frustumVisible.add(c.faceIndex);
        frustumGrace.current.delete(c.faceIndex);
        draw.add(c.faceIndex);
        continue;
      }
      const left =
        frustumGrace.current.get(c.faceIndex) ?? FRUSTUM_EXIT_GRACE_FRAMES;
      if (batch.getSubdiv(c.faceIndex) !== undefined && left > 0) {
        frustumGrace.current.set(c.faceIndex, left - 1);
        draw.add(c.faceIndex);
      } else {
        frustumGrace.current.delete(c.faceIndex);
      }
    }

    // Evict faces that left the stream plan or the frustum draw set.
    // Snapshot first: detach mutates the live-face map.
    const resident = [...batch.liveFaces()];
    for (const [id, subdiv] of resident) {
      if (draw.has(id)) {
        streamGrace.current.delete(id);
        continue;
      }
      // Still streamed but off-camera — drop from GPU quickly (frustum grace
      // already applied). Stream-only departures keep the longer grace so
      // skating the ring edge doesn't pop.
      const graceFrames = planIds.has(id) ? 0 : EVICT_GRACE_FRAMES;
      const left = streamGrace.current.get(id) ?? graceFrames;
      if (left > 0) {
        streamGrace.current.set(id, left - 1);
        live.add(faceBuildKey(id, subdiv));
        continue;
      }
      streamGrace.current.delete(id);
      batch.detach(id);
    }

    // Prefetch geometry for the full stream plan; only attach frustum-visible.
    for (const c of snap.chunks) {
      const face = faces[c.faceIndex];
      if (!face) continue;
      const key = faceBuildKey(c.faceIndex, c.subdiv);
      live.add(key);

      const inDraw = draw.has(c.faceIndex);
      const existingSubdiv = batch.getSubdiv(c.faceIndex);
      if (existingSubdiv !== undefined && existingSubdiv !== c.subdiv) {
        live.add(faceBuildKey(c.faceIndex, existingSubdiv));
      }

      const priority =
        (frustumVisible.has(c.faceIndex) ? 1_000_000 : 0) +
        face.centroid.dot(viewer.current) * 1000 +
        c.subdiv;

      if (inDraw && batch.has(c.faceIndex, c.subdiv)) {
        const cached = geoCache.current.get(key);
        if (cached) touchGeo(geoCache.current, key, cached);
        continue;
      }

      const geometry = geoCache.current.get(key);
      if (!geometry) {
        if (!requested.current.has(key)) {
          requested.current.add(key);
          void requestFaceGeometry(face, c.subdiv, priority)
            .then((geo) => {
              if (!geoCache.current.has(key)) {
                touchGeo(geoCache.current, key, geo);
                if (drawNeeded.current.has(face.index)) {
                  enqueueAttach(attachQueue.current, attachQueued.current, {
                    face,
                    subdiv: c.subdiv,
                    key,
                    geometry: geo,
                    priority,
                  });
                }
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
      if (inDraw && (planChanged || !batch.has(c.faceIndex, c.subdiv))) {
        enqueueAttach(attachQueue.current, attachQueued.current, {
          face,
          subdiv: c.subdiv,
          key,
          geometry,
          priority,
        });
      }
    }

    cancelStaleFaceBuilds(live);

    let attached = 0;
    while (attached < budget && attachQueue.current.length > 0) {
      const next = attachQueue.current.shift()!;
      attachQueued.current.delete(next.key);
      if (!live.has(next.key)) continue;
      if (!drawNeeded.current.has(next.face.index)) continue;
      if (!geoCache.current.has(next.key)) continue;
      if (batch.has(next.face.index, next.subdiv)) continue;
      batch.attach(next.face.index, next.subdiv, next.geometry);
      attached++;
    }

    // One compact/frame max — never fold into the attach loop.
    if (attached < budget) {
      batch.compactDirty();
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
  }, TERRAIN_FRAME_PRIORITY);

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
