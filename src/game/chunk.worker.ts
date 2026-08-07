import * as THREE from "three";
import { createFaceGeometryData, setChunkHeightSampler } from "./chunkGeometry";
import type {
  ChunkBuildRequest,
  ChunkBuildResponse,
  ChunkWorkerOutbound,
} from "./chunkWorkerMessages";
import { sampleHeightDir } from "./lunarTerrain";

// Workers get their own module graph — register the heightfield here.
setChunkHeightSampler(sampleHeightDir);

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();

function buildFace(msg: ChunkBuildRequest): ChunkBuildResponse {
  _a.set(msg.a[0], msg.a[1], msg.a[2]);
  _b.set(msg.b[0], msg.b[1], msg.b[2]);
  _c.set(msg.c[0], msg.c[1], msg.c[2]);
  const data = createFaceGeometryData({ a: _a, b: _b, c: _c }, msg.subdiv);
  return {
    type: "built",
    requestId: msg.requestId,
    faceIndex: msg.faceIndex,
    subdiv: msg.subdiv,
    positions: data.positions,
    colors: data.colors,
    normals: data.normals,
  };
}

type ChunkWorkerScope = {
  onmessage: ((event: MessageEvent<ChunkWorkerOutbound>) => void) | null;
  postMessage: (message: ChunkBuildResponse, transfer: Transferable[]) => void;
};

const workerScope = self as unknown as ChunkWorkerScope;

workerScope.onmessage = (event: MessageEvent<ChunkWorkerOutbound>) => {
  const msg = event.data;
  if (msg.type !== "build") return;
  const response = buildFace(msg);
  // Indices stay on the main thread (shared template) — transfer verts only.
  workerScope.postMessage(response, [
    response.positions.buffer,
    response.colors.buffer,
    response.normals.buffer,
  ]);
};
