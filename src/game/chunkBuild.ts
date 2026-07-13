import * as THREE from "three";
import { createFaceGeometryData, faceGeometryFromData } from "./chunkGeometry";
import type { IcoFace } from "./chunkLod";
import type {
  ChunkBuildRequest,
  ChunkWorkerInbound,
  FaceCorner,
} from "./chunkWorkerMessages";

export type FaceBuildKey = string;

export function faceBuildKey(faceIndex: number, subdiv: number): FaceBuildKey {
  return `${faceIndex}:${subdiv}`;
}

type Pending = {
  faceIndex: number;
  subdiv: number;
  a: FaceCorner;
  b: FaceCorner;
  c: FaceCorner;
  /** Higher = build sooner (near / dense first). */
  priority: number;
};

type Resolver = {
  resolve: (geo: THREE.BufferGeometry) => void;
  reject: (err: unknown) => void;
};

type PoolWorker = {
  worker: Worker;
  busy: boolean;
};

/** Cap parallel workers — leave a core for the main/render thread. */
function desiredPoolSize(): number {
  if (typeof navigator === "undefined") return 2;
  const cores = navigator.hardwareConcurrency || 4;
  return Math.max(1, Math.min(4, cores - 1));
}

let pool: PoolWorker[] = [];
let workerFailed = false;
let nextRequestId = 1;

const pendingByKey = new Map<FaceBuildKey, Pending>();
const inflight = new Map<
  number,
  { key: FaceBuildKey; resolvers: Resolver[]; slot: PoolWorker }
>();
const waitingResolvers = new Map<FaceBuildKey, Resolver[]>();
const scheduled = new Set<FaceBuildKey>();

function toCorner(v: THREE.Vector3): FaceCorner {
  return [v.x, v.y, v.z];
}

function spawnWorker(): PoolWorker | null {
  if (typeof Worker === "undefined") return null;
  try {
    const worker = new Worker(new URL("./chunk.worker.ts", import.meta.url), {
      type: "module",
    });
    const slot: PoolWorker = { worker, busy: false };
    worker.onmessage = (event: MessageEvent<ChunkWorkerInbound>) => {
      onWorkerMessage(event.data, slot);
    };
    worker.onerror = () => {
      workerFailed = true;
      failAll(new Error("chunk worker failed"));
      for (const s of pool) s.worker.terminate();
      pool = [];
    };
    return slot;
  } catch {
    return null;
  }
}

function ensurePool(): PoolWorker[] {
  if (workerFailed) return [];
  if (pool.length > 0) return pool;
  const size = desiredPoolSize();
  for (let i = 0; i < size; i++) {
    const slot = spawnWorker();
    if (!slot) {
      workerFailed = true;
      for (const s of pool) s.worker.terminate();
      pool = [];
      return [];
    }
    pool.push(slot);
  }
  return pool;
}

function failAll(err: unknown): void {
  for (const entry of inflight.values()) {
    entry.slot.busy = false;
    for (const r of entry.resolvers) r.reject(err);
  }
  inflight.clear();
  for (const resolvers of waitingResolvers.values()) {
    for (const r of resolvers) r.reject(err);
  }
  waitingResolvers.clear();
  pendingByKey.clear();
  scheduled.clear();
}

function onWorkerMessage(msg: ChunkWorkerInbound, slot: PoolWorker): void {
  if (msg.type !== "built") return;
  const entry = inflight.get(msg.requestId);
  if (!entry) {
    // Stale / cancelled response — drop buffers, free the slot.
    slot.busy = false;
    pump();
    return;
  }
  inflight.delete(msg.requestId);
  scheduled.delete(entry.key);
  slot.busy = false;

  const geo = faceGeometryFromData({
    positions: msg.positions,
    colors: msg.colors,
    normals: msg.normals,
    indices: msg.indices,
  });
  for (const r of entry.resolvers) r.resolve(geo);
  pump();
}

function buildSync(pending: Pending): THREE.BufferGeometry {
  return faceGeometryFromData(
    createFaceGeometryData(
      {
        a: new THREE.Vector3(...pending.a),
        b: new THREE.Vector3(...pending.b),
        c: new THREE.Vector3(...pending.c),
      },
      pending.subdiv,
    ),
  );
}

function idleSlot(): PoolWorker | null {
  for (const slot of pool) {
    if (!slot.busy) return slot;
  }
  return null;
}

function pump(): void {
  const workers = ensurePool();
  const maxInflight = Math.max(1, workers.length || 1);

  while (inflight.size < maxInflight && pendingByKey.size > 0) {
    let bestKey: FaceBuildKey | null = null;
    let best: Pending | null = null;
    for (const [key, p] of pendingByKey) {
      if (!best || p.priority > best.priority) {
        bestKey = key;
        best = p;
      }
    }
    if (!bestKey || !best) break;
    pendingByKey.delete(bestKey);

    const resolvers = waitingResolvers.get(bestKey) ?? [];
    waitingResolvers.delete(bestKey);

    if (workers.length === 0) {
      // Fallback: sync on main (tests / Worker unavailable).
      try {
        const geo = buildSync(best);
        scheduled.delete(bestKey);
        for (const r of resolvers) r.resolve(geo);
      } catch (err) {
        scheduled.delete(bestKey);
        for (const r of resolvers) r.reject(err);
      }
      continue;
    }

    const slot = idleSlot();
    if (!slot) {
      pendingByKey.set(bestKey, best);
      waitingResolvers.set(bestKey, resolvers);
      break;
    }

    const requestId = nextRequestId++;
    slot.busy = true;
    inflight.set(requestId, { key: bestKey, resolvers, slot });
    const msg: ChunkBuildRequest = {
      type: "build",
      requestId,
      faceIndex: best.faceIndex,
      subdiv: best.subdiv,
      a: best.a,
      b: best.b,
      c: best.c,
    };
    slot.worker.postMessage(msg);
  }
}

/**
 * Request a face patch. Builds on a worker pool when available.
 * Same key shares one build; higher `priority` jumps the queue.
 */
export function requestFaceGeometry(
  face: IcoFace,
  subdiv: number,
  priority = subdiv,
): Promise<THREE.BufferGeometry> {
  const key = faceBuildKey(face.index, subdiv);
  return new Promise((resolve, reject) => {
    const resolver: Resolver = { resolve, reject };
    const existing = waitingResolvers.get(key);
    if (existing) {
      existing.push(resolver);
      const pending = pendingByKey.get(key);
      if (pending && priority > pending.priority) pending.priority = priority;
      return;
    }

    for (const entry of inflight.values()) {
      if (entry.key === key) {
        entry.resolvers.push(resolver);
        return;
      }
    }

    waitingResolvers.set(key, [resolver]);
    if (!scheduled.has(key)) {
      scheduled.add(key);
      pendingByKey.set(key, {
        faceIndex: face.index,
        subdiv,
        a: toCorner(face.a),
        b: toCorner(face.b),
        c: toCorner(face.c),
        priority,
      });
    } else {
      const pending = pendingByKey.get(key);
      if (pending && priority > pending.priority) pending.priority = priority;
    }
    pump();
  });
}

function inflightHasKey(key: FaceBuildKey): boolean {
  for (const entry of inflight.values()) {
    if (entry.key === key) return true;
  }
  return false;
}

/**
 * Drop queued builds that are no longer live.
 * In-flight work is not interrupted (Workers have no cancel); the result is
 * discarded on completion when the streamer no longer wants that key.
 * Callers keep the previous mesh until a new subdiv key is ready, then swap.
 */
export function cancelStaleFaceBuilds(
  liveKeys: ReadonlySet<FaceBuildKey>,
): void {
  for (const [key, resolvers] of waitingResolvers) {
    if (liveKeys.has(key)) continue;
    if (inflightHasKey(key)) continue;
    waitingResolvers.delete(key);
    pendingByKey.delete(key);
    scheduled.delete(key);
    for (const r of resolvers) {
      r.reject(new DOMException("chunk build cancelled", "AbortError"));
    }
  }
}

/** Pending + inflight builds (for ?debug). */
export function getChunkQueueDepth(): number {
  return pendingByKey.size + inflight.size;
}

/** Active worker count (0 = sync fallback). */
export function getChunkWorkerCount(): number {
  return ensurePool().length;
}

/** Test / teardown helper. */
export function resetChunkBuildQueue(): void {
  for (const s of pool) s.worker.terminate();
  pool = [];
  workerFailed = false;
  nextRequestId = 1;
  pendingByKey.clear();
  inflight.clear();
  waitingResolvers.clear();
  scheduled.clear();
}
