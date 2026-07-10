import type * as THREE from 'three';
import type { PhysicsState } from './types.ts';
import { chunkSize, terrainViewDistance } from '../config.ts';
import { calculateTerrainHeight } from './terrainMath.ts';

export type TerrainChunkDescriptor = {
    key: string;
    cx: number;
    cz: number;
    lodName: 'near' | 'mid' | 'far';
    segments: number;
};

let r3fChunkCount = 0;

export function setR3FTerrainChunkCount(count: number) {
    r3fChunkCount = count;
}

export function getRenderedTerrainChunkCount() {
    return r3fChunkCount;
}

function chunkKey(cx: number, cz: number) {
    return `${cx},${cz}`;
}

function getChunkLod(distanceInChunks: number): Pick<TerrainChunkDescriptor, 'lodName' | 'segments'> {
    if (distanceInChunks <= 1.25) return { lodName: 'near', segments: 56 };
    if (distanceInChunks <= 2.25) return { lodName: 'mid', segments: 28 };
    return { lodName: 'far', segments: 12 };
}

export function getTerrainChunkPlan(x: number, z: number): TerrainChunkDescriptor[] {
    const playerCx = Math.round(x / chunkSize);
    const playerCz = Math.round(z / chunkSize);
    const chunks: TerrainChunkDescriptor[] = [];

    for (let dz = -terrainViewDistance; dz <= terrainViewDistance; dz++) {
        for (let dx = -terrainViewDistance; dx <= terrainViewDistance; dx++) {
            const dist = Math.sqrt(dx * dx + dz * dz);
            if (dist > terrainViewDistance + 0.35) continue;
            const cx = playerCx + dx;
            const cz = playerCz + dz;
            chunks.push({ key: chunkKey(cx, cz), cx, cz, ...getChunkLod(dist) });
        }
    }

    return chunks;
}

export { calculateTerrainHeight } from './terrainMath.ts';

export function getTerrainHeight(x: number, z: number) {
    return calculateTerrainHeight(x, z);
}

export function getTerrainNormal(
    x: number,
    z: number,
    scratch: { terrainNormal: THREE.Vector3 },
) {
    const d = 2.8;
    const hL = getTerrainHeight(x - d, z);
    const hR = getTerrainHeight(x + d, z);
    const hD = getTerrainHeight(x, z - d);
    const hU = getTerrainHeight(x, z + d);
    scratch.terrainNormal.set(hL - hR, d * 2, hD - hU).normalize();
    return scratch.terrainNormal;
}

export function getHeightAboveTerrain(
    x: number,
    y: number,
    z: number,
    scratch: {
        terrainNormal: THREE.Vector3;
        normalProbeA: THREE.Vector3;
        normalProbeB: THREE.Vector3;
    },
) {
    const terrainH = getTerrainHeight(x, z);
    const normal = getTerrainNormal(x, z, scratch);
    scratch.normalProbeA.set(x, terrainH, z);
    scratch.normalProbeB.set(x, y, z).sub(scratch.normalProbeA);
    return scratch.normalProbeB.dot(normal);
}

export function alignPlayerToTerrain(
    playerGroup: THREE.Group,
    physics: PhysicsState,
    scratch: {
        baseForward: THREE.Vector3;
        slopeForward: THREE.Vector3;
        slopeRight: THREE.Vector3;
        terrainNormal: THREE.Vector3;
        playerMatrix: THREE.Matrix4;
        targetPlayerQuat: THREE.Quaternion;
    },
    frameScale = 1,
) {
    const normal = getTerrainNormal(playerGroup.position.x, playerGroup.position.z, scratch);
    scratch.baseForward.set(Math.sin(physics.heading), 0, Math.cos(physics.heading));
    scratch.slopeForward.copy(scratch.baseForward).addScaledVector(normal, -scratch.baseForward.dot(normal)).normalize();
    if (scratch.slopeForward.lengthSq() < 0.0001) scratch.slopeForward.set(0, 0, 1);
    scratch.slopeRight.crossVectors(normal, scratch.slopeForward).normalize();

    scratch.playerMatrix.makeBasis(scratch.slopeRight, normal, scratch.slopeForward);
    scratch.targetPlayerQuat.setFromRotationMatrix(scratch.playerMatrix);
    const tiltSmoothing = 1 - Math.pow(1 - physics.tiltSmoothing, frameScale);
    playerGroup.quaternion.slerp(scratch.targetPlayerQuat, tiltSmoothing);
}

export function alignPlayerHeadingInAir(
    playerGroup: THREE.Group,
    physics: PhysicsState,
    scratch: { upAxis: THREE.Vector3; targetPlayerQuat: THREE.Quaternion },
    frameScale = 1,
) {
    scratch.upAxis.set(0, 1, 0);
    scratch.targetPlayerQuat.setFromAxisAngle(scratch.upAxis, physics.heading);
    const tiltSmoothing = 1 - Math.pow(1 - physics.tiltSmoothing * 1.3, frameScale);
    playerGroup.quaternion.slerp(scratch.targetPlayerQuat, tiltSmoothing);
}
