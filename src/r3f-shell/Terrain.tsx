import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { chunkSize } from '../config.ts';
import {
    getTerrainChunkPlan,
    getTerrainHeight,
    setR3FTerrainChunkCount,
} from '../game/terrain.ts';
import type { TerrainChunkDescriptor } from '../game/terrain.ts';
import type { VoxelDogParts } from '../game/types.ts';

type TerrainMaterials = Record<TerrainChunkDescriptor['lodName'], THREE.MeshStandardMaterial>;

function createChunkGeometry({ cx, cz, segments }: TerrainChunkDescriptor) {
    const geometry = new THREE.PlaneGeometry(chunkSize, chunkSize, segments, segments);
    geometry.rotateX(-Math.PI / 2);
    const positions = geometry.attributes.position!;
    const originX = cx * chunkSize;
    const originZ = cz * chunkSize;

    for (let index = 0; index < positions.count; index++) {
        positions.setY(index, getTerrainHeight(originX + positions.getX(index), originZ + positions.getZ(index)));
    }
    geometry.computeVertexNormals();
    return geometry;
}

function TerrainChunk({ chunk, material }: { chunk: TerrainChunkDescriptor; material: THREE.MeshStandardMaterial }) {
    const geometry = useMemo(() => createChunkGeometry(chunk), [chunk]);

    useEffect(() => () => geometry.dispose(), [geometry]);

    return <mesh geometry={geometry} material={material} position={[chunk.cx * chunkSize, 0, chunk.cz * chunkSize]} receiveShadow dispose={null} />;
}

export function Terrain({ player }: { player: VoxelDogParts }) {
    const [chunks, setChunks] = useState<TerrainChunkDescriptor[]>(() => getTerrainChunkPlan(0, 0));
    const currentChunk = useRef('');
    const materials = useMemo<TerrainMaterials>(() => {
        const near = new THREE.MeshStandardMaterial({ color: 0x7d8490, roughness: 0.95, metalness: 0.05, flatShading: false });
        const mid = near.clone();
        mid.color.setHex(0x737b86);
        const far = near.clone();
        far.color.setHex(0x666e78);
        return { near, mid, far };
    }, []);

    useEffect(() => () => Object.values(materials).forEach((material) => material.dispose()), [materials]);
    useEffect(() => {
        setR3FTerrainChunkCount(chunks.length);
    }, [chunks.length]);

    useFrame(() => {
        const root = player.playerGroup ?? player.group;
        const cx = Math.round(root.position.x / chunkSize);
        const cz = Math.round(root.position.z / chunkSize);
        const key = `${cx},${cz}`;
        if (key === currentChunk.current) return;
        currentChunk.current = key;
        setChunks(getTerrainChunkPlan(root.position.x, root.position.z));
    });

    return <group>{chunks.map((chunk) => <TerrainChunk key={chunk.key} chunk={chunk} material={materials[chunk.lodName]} />)}</group>;
}
