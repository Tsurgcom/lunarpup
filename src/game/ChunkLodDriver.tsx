import { useFrame } from "@react-three/fiber";
import { useEffect } from "react";
import { resetChunkLod, updateChunkLod } from "./chunkLod";
import { getLocalPose } from "./localPose";

/**
 * Drives the velocity-based chunk LOD plan each frame.
 * Mount after {@link Player} so pose + velocity are fresh.
 * {@link ChunkTerrain} consumes the plan and rebuilds patches on workers.
 *
 * Streaming is pup/viewer-centric (arc + horizon) — intentionally ignores
 * the chase camera so orbiting never thrash-loads chunks.
 */
export function ChunkLodDriver() {
  useEffect(() => () => resetChunkLod(), []);

  useFrame(() => {
    const pose = getLocalPose();
    updateChunkLod(pose.x, pose.y, pose.z, pose.vx, pose.vy, pose.vz);
  });

  return null;
}
