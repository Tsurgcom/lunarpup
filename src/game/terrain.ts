import * as THREE from 'three';
import { chunkSize, terrainViewDistance } from '../config.ts';
import {
    scene,
    terrainChunks,
    terrainMaterials,
    playerGroup,
    physics,
    scratch,
    setTerrainRoot,
    terrainRoot,
} from '../state.ts';

export type TerrainChunkDescriptor = {
    key: string;
    cx: number;
    cz: number;
    lodName: 'near' | 'mid' | 'far';
    segments: number;
};

let terrainPresentationMode: 'legacy' | 'r3f' = 'legacy';
let r3fChunkCount = 0;

export function setTerrainPresentationMode(mode: 'legacy' | 'r3f') {
    terrainPresentationMode = mode;
    if (mode === 'legacy') r3fChunkCount = 0;
}

export function setR3FTerrainChunkCount(count: number) {
    r3fChunkCount = count;
}

export function getRenderedTerrainChunkCount() {
    return terrainPresentationMode === 'r3f' ? r3fChunkCount : terrainChunks.size;
}

export function initTerrain() {
    disposeTerrain();
    if (terrainPresentationMode === 'r3f') return;
    const root = new THREE.Group();
    setTerrainRoot(root);
    scene.add(root);

    terrainMaterials.near = new THREE.MeshStandardMaterial({
        color: 0x7d8490,
        roughness: 0.95,
        metalness: 0.05,
        flatShading: false,
    });
    terrainMaterials.mid = terrainMaterials.near.clone();
    terrainMaterials.mid.color.setHex(0x737b86);
    terrainMaterials.far = terrainMaterials.near.clone();
    terrainMaterials.far.color.setHex(0x666e78);
}

export function disposeTerrain() {
    for (const mesh of terrainChunks.values()) {
        mesh.removeFromParent();
        mesh.geometry.dispose();
    }
    terrainChunks.clear();

    if (terrainRoot) terrainRoot.removeFromParent();
    for (const material of Object.values(terrainMaterials)) material.dispose();
    for (const key of Object.keys(terrainMaterials)) delete terrainMaterials[key];
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

function createTerrainChunk(cx: number, cz: number, lodName: string, chunkSegments: number) {
    const geometry = new THREE.PlaneGeometry(chunkSize, chunkSize, chunkSegments, chunkSegments);
    geometry.rotateX(-Math.PI / 2);

    const originX = cx * chunkSize;
    const originZ = cz * chunkSize;
    const pos = geometry.attributes.position!;

    for (let i = 0; i < pos.count; i++) {
        const wx = originX + pos.getX(i);
        const wz = originZ + pos.getZ(i);
        pos.setY(i, calculateTerrainHeight(wx, wz));
    }

    geometry.computeVertexNormals();

    const mesh = new THREE.Mesh(geometry, terrainMaterials[lodName]);
    mesh.position.set(originX, 0, originZ);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.userData.cx = cx;
    mesh.userData.cz = cz;
    mesh.userData.lodName = lodName;
    terrainRoot.add(mesh);
    return mesh;
}

export function updateTerrainChunks(force = false) {
    if (!terrainRoot) return;
    if (terrainPresentationMode === 'r3f') return;

    const playerCx = Math.round(playerGroup.position.x / chunkSize);
    const playerCz = Math.round(playerGroup.position.z / chunkSize);
    const needed = new Set<string>();

    for (let dz = -terrainViewDistance; dz <= terrainViewDistance; dz++) {
        for (let dx = -terrainViewDistance; dx <= terrainViewDistance; dx++) {
            const cx = playerCx + dx;
            const cz = playerCz + dz;
            const key = chunkKey(cx, cz);
            const dist = Math.sqrt(dx * dx + dz * dz);
            if (dist > terrainViewDistance + 0.35) continue;

            needed.add(key);
            const lod = getChunkLod(dist);
            const existing = terrainChunks.get(key);

            if (!existing || existing.userData.lodName !== lod.lodName || force) {
                if (existing) {
                    terrainRoot.remove(existing);
                    existing.geometry.dispose();
                }
                terrainChunks.set(key, createTerrainChunk(cx, cz, lod.lodName, lod.segments));
            }
        }
    }

    terrainChunks.forEach((mesh, key) => {
        if (!needed.has(key)) {
            terrainRoot.remove(mesh);
            mesh.geometry.dispose();
            terrainChunks.delete(key);
        }
    });
}

function hash2(x: number, z: number) {
    const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453123;
    return n - Math.floor(n);
}

function smoothstep(t: number) {
    return t * t * (3 - 2 * t);
}

function valueNoise(x: number, z: number) {
    const ix = Math.floor(x);
    const iz = Math.floor(z);
    const fx = smoothstep(x - ix);
    const fz = smoothstep(z - iz);

    const a = hash2(ix, iz);
    const b = hash2(ix + 1, iz);
    const c = hash2(ix, iz + 1);
    const d = hash2(ix + 1, iz + 1);

    const ab = THREE.MathUtils.lerp(a, b, fx);
    const cd = THREE.MathUtils.lerp(c, d, fx);
    return THREE.MathUtils.lerp(ab, cd, fz) * 2 - 1;
}

function fractalNoise(x: number, z: number) {
    let total = 0;
    let amp = 1;
    let freq = 1;
    let norm = 0;
    for (let i = 0; i < 5; i++) {
        total += valueNoise(x * freq, z * freq) * amp;
        norm += amp;
        amp *= 0.5;
        freq *= 2;
    }
    return total / norm;
}

export function calculateTerrainHeight(x: number, z: number) {
    let y = fractalNoise(x * 0.0032, z * 0.0032) * 28;
    y += fractalNoise(x * 0.012 + 50, z * 0.012 - 20) * 9;

    y += Math.pow(Math.max(0, Math.sin(x * 0.0033 + Math.sin(z * 0.0025) * 2.2)), 2.15) * 64;
    y += Math.pow(Math.max(0, Math.cos((x + z) * 0.0028)), 2.8) * 38;

    const cell = 720;
    const baseCx = Math.floor(x / cell);
    const baseCz = Math.floor(z / cell);
    for (let oz = -1; oz <= 1; oz++) {
        for (let ox = -1; ox <= 1; ox++) {
            const gx = baseCx + ox;
            const gz = baseCz + oz;
            const px = (gx + hash2(gx, gz) * 0.8 + 0.1) * cell;
            const pz = (gz + hash2(gx + 91, gz - 47) * 0.8 + 0.1) * cell;
            const radius = 170 + hash2(gx - 12, gz + 31) * 260;
            const height = 45 + hash2(gx + 7, gz + 13) * 95;
            const dx = x - px;
            const dz = z - pz;
            const dist = Math.sqrt(dx * dx + dz * dz);
            const t = Math.max(0, 1 - dist / radius);
            y += Math.pow(t, 2.35) * height;
        }
    }

    const craterCell = 560;
    const ccx = Math.floor(x / craterCell);
    const ccz = Math.floor(z / craterCell);
    for (let oz = -1; oz <= 1; oz++) {
        for (let ox = -1; ox <= 1; ox++) {
            const gx = ccx + ox;
            const gz = ccz + oz;
            if (hash2(gx + 201, gz - 109) < 0.48) continue;

            const cx = (gx + 0.18 + hash2(gx + 5, gz + 6) * 0.64) * craterCell;
            const cz = (gz + 0.18 + hash2(gx - 8, gz + 3) * 0.64) * craterCell;
            const radius = 105 + hash2(gx + 22, gz + 22) * 105;
            const depth = 32 + hash2(gx - 44, gz + 11) * 46;
            const rimHeight = 8 + hash2(gx + 14, gz - 14) * 12;
            const dx = x - cx;
            const dz = z - cz;
            const dist = Math.sqrt(dx * dx + dz * dz);
            if (dist < radius * 1.18) {
                const t = dist / radius;
                if (t < 1) {
                    const bowl = -depth * Math.pow(1 - t * t, 1.28);
                    const rim = Math.exp(-Math.pow((t - 0.9) * 6.2, 2)) * rimHeight;
                    y += bowl + rim;
                } else {
                    const outer = Math.max(0, 1 - (t - 1) / 0.18);
                    y += outer * rimHeight * 0.35;
                }
            }
        }
    }

    return y;
}

export function getTerrainHeight(x: number, z: number) {
    return calculateTerrainHeight(x, z);
}

export function getTerrainNormal(x: number, z: number) {
    const d = 2.8;
    const hL = getTerrainHeight(x - d, z);
    const hR = getTerrainHeight(x + d, z);
    const hD = getTerrainHeight(x, z - d);
    const hU = getTerrainHeight(x, z + d);
    scratch.terrainNormal.set(hL - hR, d * 2, hD - hU).normalize();
    return scratch.terrainNormal;
}

/** Signed distance from (x, y, z) above the terrain surface along its normal. */
export function getHeightAboveTerrain(x: number, y: number, z: number) {
    const terrainH = getTerrainHeight(x, z);
    const normal = getTerrainNormal(x, z);
    scratch.normalProbeA.set(x, terrainH, z);
    scratch.normalProbeB.set(x, y, z).sub(scratch.normalProbeA);
    return scratch.normalProbeB.dot(normal);
}

export function alignPlayerToTerrain(frameScale = 1) {
    const normal = getTerrainNormal(playerGroup.position.x, playerGroup.position.z);
    scratch.baseForward.set(Math.sin(physics.heading), 0, Math.cos(physics.heading));
    scratch.slopeForward.copy(scratch.baseForward).addScaledVector(normal, -scratch.baseForward.dot(normal)).normalize();
    if (scratch.slopeForward.lengthSq() < 0.0001) scratch.slopeForward.set(0, 0, 1);
    scratch.slopeRight.crossVectors(normal, scratch.slopeForward).normalize();

    scratch.playerMatrix.makeBasis(scratch.slopeRight, normal, scratch.slopeForward);
    scratch.targetPlayerQuat.setFromRotationMatrix(scratch.playerMatrix);
    const tiltSmoothing = 1 - Math.pow(1 - physics.tiltSmoothing, frameScale);
    playerGroup.quaternion.slerp(scratch.targetPlayerQuat, tiltSmoothing);
}
