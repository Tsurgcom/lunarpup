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

function corner(v: readonly [number, number, number]): THREE.Vector3 {
  return new THREE.Vector3(v[0], v[1], v[2]);
}

function buildFace(msg: ChunkBuildRequest): ChunkBuildResponse {
  const data = createFaceGeometryData(
    {
      a: corner(msg.a),
      b: corner(msg.b),
      c: corner(msg.c),
    },
    msg.subdiv,
  );
  return {
    type: "built",
    requestId: msg.requestId,
    faceIndex: msg.faceIndex,
    subdiv: msg.subdiv,
    positions: data.positions,
    colors: data.colors,
    normals: data.normals,
    indices: data.indices,
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
  workerScope.postMessage(response, [
    response.positions.buffer,
    response.colors.buffer,
    response.normals.buffer,
    response.indices.buffer,
  ]);
};
