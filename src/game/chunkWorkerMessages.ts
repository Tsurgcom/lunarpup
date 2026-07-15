/**
 * Shared message types for the chunk geometry worker pool.
 * Kept dependency-free so both main and worker can import safely.
 *
 * Index buffers are reconstructed on the main thread from a shared subdiv
 * template — not transferred (saves bandwidth + avoids detaching the cache).
 */

export type FaceCorner = readonly [number, number, number];

export type ChunkBuildRequest = {
  type: "build";
  requestId: number;
  faceIndex: number;
  subdiv: number;
  a: FaceCorner;
  b: FaceCorner;
  c: FaceCorner;
};

export type ChunkBuildResponse = {
  type: "built";
  requestId: number;
  faceIndex: number;
  subdiv: number;
  positions: Float32Array;
  colors: Float32Array;
  normals: Float32Array;
};

export type ChunkWorkerOutbound = ChunkBuildRequest;
export type ChunkWorkerInbound = ChunkBuildResponse;
