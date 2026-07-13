import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { RemotePlayerRecord } from '../game/types.ts';
import { deckColorFromDog } from '../game/dogTint.ts';
import { VoxelDogModel, type VoxelDogModelHandle } from './VoxelDogModel.tsx';

function animateRemoteHoverPads(
    skateboard: THREE.Group,
    speed: number,
    isGrounded: boolean,
    frameScale: number,
) {
    const pulseStrength = isGrounded ? Math.min(Math.abs(speed) * 1.6, 1.4) : 0.15;
    const time = Date.now() * 0.012;
    for (const child of skateboard.children) {
        if (child.userData.hoverPad !== true) continue;
        const phase = child.userData.hoverPhase ?? 0;
        const bob = 1 + Math.sin(time + phase) * 0.08 * (0.35 + pulseStrength);
        child.scale.y = bob;
        const material = (child as THREE.Mesh).material;
        if (material instanceof THREE.MeshStandardMaterial) {
            material.emissiveIntensity = isGrounded ? 0.35 + pulseStrength * 0.45 : 0.08;
        }
        child.rotation.y += speed * 0.35 * frameScale;
    }
}

function RemotePlayer({ record }: { record: RemotePlayerRecord }) {
    const modelRef = useRef<VoxelDogModelHandle>(null);

    useFrame((_, dt) => {
        const model = modelRef.current;
        if (!model) return;

        const { current } = record;
        model.playerGroup.position.set(current.x, current.y, current.z);
        model.playerGroup.quaternion.set(current.qx, current.qy, current.qz, current.qw);
        model.skateboard.rotation.x = current.boardTiltX;
        model.skateboard.rotation.z = current.boardTiltZ;

        const frameScale = dt * 60;
        if (Math.abs(current.speed) > 0.03 || current.isGrounded) {
            const time = Date.now() * 0.015;
            model.tail.rotation.z = Math.sin(time + current.x) * 0.4;
            animateRemoteHoverPads(model.skateboard, current.speed, current.isGrounded, frameScale);
        }
    });

    return (
        <VoxelDogModel
            ref={modelRef}
            dogColor={record.color}
            deckColor={deckColorFromDog(record.color)}
        />
    );
}

export function RemotePlayers({ records }: { records: RemotePlayerRecord[] }) {
    return (
        <>
            {records.map((record) => (
                <RemotePlayer key={record.id} record={record} />
            ))}
        </>
    );
}
