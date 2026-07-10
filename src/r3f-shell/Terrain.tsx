import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { chunkSize, maxChunkBuildsPerFrame } from '../config.ts';
import {
    getTerrainChunkPlan,
    getTerrainHeight,
    setR3FTerrainChunkCount,
} from '../game/terrain.ts';
import type { TerrainChunkDescriptor } from '../game/terrain.ts';
import type { VoxelDogParts } from '../game/types.ts';

type TerrainMaterials = Record<TerrainChunkDescriptor['lodName'], THREE.MeshStandardMaterial>;

// Cache key includes the segment count so an LOD change rebuilds, while a plain
// border crossing (same cx,cz,lod) reuses the existing geometry instead of rebuilding.
const cacheKey = (chunk: TerrainChunkDescriptor) => `${chunk.key}:${chunk.segments}`;

function createChunkGeometry({ cx, cz, segments }: TerrainChunkDescriptor): THREE.BufferGeometry {
    const geometry = new THREE.PlaneGeometry(chunkSize, chunkSize, segments, segments);
    geometry.rotateX(-Math.PI / 2);
    const positions = geometry.attributes.position!;
    const originX = cx * chunkSize;
    const originZ = cz * chunkSize;

    for (let index = 0; index < positions.count; index++) {
        positions.setY(index, getTerrainHeight(originX + positions.getX(index), originZ + positions.getZ(index)));
    }
    geometry.computeVertexNormals();
    // Frustum culling uses the bounding sphere; a plane's default sphere has no Y
    // extent, so without this the displaced terrain is culled against wrong bounds
    // (tall chunks can pop out when the camera looks up/down). Recompute after setY.
    geometry.computeBoundingSphere();
    return geometry;
}

interface LiveChunk {
    chunk: TerrainChunkDescriptor;
    geometry: THREE.BufferGeometry;
}

export function Terrain({ player }: { player: VoxelDogParts }) {
    const materials = useMemo<TerrainMaterials>(() => {
        const near = new THREE.MeshStandardMaterial({ color: 0x7d8490, roughness: 0.95, metalness: 0.05, flatShading: false });
        const mid = near.clone();
        mid.color.setHex(0x737b86);
        const far = near.clone();
        far.color.setHex(0x666e78);
        return { near, mid, far };
    }, []);

    // Persistent geometry cache — survives border crossings so unchanged chunks are
    // never rebuilt (the old code rebuilt every visible chunk on each crossing).
    const cache = useRef(new Map<string, LiveChunk>());
    const queue = useRef<TerrainChunkDescriptor[]>([]);
    const graveyard = useRef<THREE.BufferGeometry[]>([]);
    const currentChunk = useRef<string | null>(null);
    const [mounted, setMounted] = useState<string[]>([]);

    const reconcile = (plan: TerrainChunkDescriptor[], centerCx: number, centerCz: number) => {
        const desired = new Map(plan.map((chunk) => [cacheKey(chunk), chunk] as const));

        // Chunks that left view: retire the geometry to the graveyard (disposed next
        // frame, after the re-render stops referencing it — avoids drawing a disposed
        // geometry for one frame).
        for (const [key, live] of cache.current) {
            if (!desired.has(key)) {
                graveyard.current.push(live.geometry);
                cache.current.delete(key);
            }
        }

        // New chunks not yet built and not already queued.
        const queued = new Set(queue.current.map(cacheKey));
        for (const chunk of plan) {
            const key = cacheKey(chunk);
            if (!cache.current.has(key) && !queued.has(key)) queue.current.push(chunk);
        }

        // Drop queued chunks no longer desired (player moved away before build), then
        // build nearest-first so the ground under the player always appears first.
        const distSq = (chunk: TerrainChunkDescriptor) =>
            (chunk.cx - centerCx) ** 2 + (chunk.cz - centerCz) ** 2;
        queue.current = queue.current
            .filter((chunk) => desired.has(cacheKey(chunk)))
            .sort((a, b) => distSq(a) - distSq(b));
    };

    const flush = (budget: number): number => {
        let built = 0;
        while (queue.current.length > 0 && built < budget) {
            const chunk = queue.current.shift()!;
            const key = cacheKey(chunk);
            if (cache.current.has(key)) continue;
            cache.current.set(key, { chunk, geometry: createChunkGeometry(chunk) });
            built++;
        }
        return built;
    };

    // Seed the initial ring synchronously on mount so the ground exists on frame one.
    useEffect(() => {
        reconcile(getTerrainChunkPlan(0, 0), 0, 0);
        flush(Number.POSITIVE_INFINITY);
        setMounted([...cache.current.keys()]);
        setR3FTerrainChunkCount(cache.current.size);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => () => {
        for (const { geometry } of cache.current.values()) geometry.dispose();
        for (const geometry of graveyard.current) geometry.dispose();
        cache.current.clear();
        graveyard.current = [];
        Object.values(materials).forEach((material) => material.dispose());
    }, [materials]);

    useFrame(() => {
        // Dispose the previous frame's retired geometries — the re-render without them
        // has committed by now.
        if (graveyard.current.length > 0) {
            for (const geometry of graveyard.current) geometry.dispose();
            graveyard.current = [];
        }

        const root = player.playerGroup ?? player.group;
        const cx = Math.round(root.position.x / chunkSize);
        const cz = Math.round(root.position.z / chunkSize);
        const key = `${cx},${cz}`;
        const moved = key !== currentChunk.current;
        if (moved) {
            currentChunk.current = key;
            reconcile(getTerrainChunkPlan(root.position.x, root.position.z), cx, cz);
        }

        const built = queue.current.length > 0 ? flush(maxChunkBuildsPerFrame) : 0;
        if (moved || built > 0) {
            setMounted([...cache.current.keys()]);
            setR3FTerrainChunkCount(cache.current.size);
        }
    });

    return (
        <group>
            {mounted.map((key) => {
                const live = cache.current.get(key);
                if (!live) return null;
                return (
                    <mesh
                        key={key}
                        geometry={live.geometry}
                        material={materials[live.chunk.lodName]}
                        position={[live.chunk.cx * chunkSize, 0, live.chunk.cz * chunkSize]}
                        receiveShadow
                        dispose={null}
                    />
                );
            })}
        </group>
    );
}
