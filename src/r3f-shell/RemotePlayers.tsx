import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import type { RemotePlayerRecord } from '../game/types.ts';
import { deckColorFromDog } from '../game/dogTint.ts';
import { VoxelDogModel, type VoxelDogModelHandle } from './VoxelDogModel.tsx';
import {
    applyRemoteCosmetics,
    getCosmeticCatalogRevision,
    subscribeCosmeticCatalog,
} from '../game/cosmetics.ts';

function RemotePlayer({ record, catalogRevision }: { record: RemotePlayerRecord; catalogRevision: number }) {
    const modelRef = useRef<VoxelDogModelHandle>(null);

    useFrame((_, dt) => {
        const model = modelRef.current;
        if (!model) return;

        const { current } = record;
        model.playerGroup.position.set(current.x, current.y, current.z);
        model.playerGroup.quaternion.set(current.qx, current.qy, current.qz, current.qw);
        model.skateboard.rotation.x = current.boardTiltX;
        model.skateboard.rotation.z = current.boardTiltZ;

        if (Math.abs(current.speed) > 0.05) {
            const time = Date.now() * 0.015;
            model.tail.rotation.z = Math.sin(time + current.x) * 0.4;
            for (let i = 1; i < model.skateboard.children.length; i++) {
                model.skateboard.children[i]!.rotation.x += current.speed * 2 * dt * 60;
            }
        }
    });

    useEffect(() => {
        const model = modelRef.current;
        if (!model) return;
        applyRemoteCosmetics(model, record.current.cosmetics);
    }, [catalogRevision, record, record.cosmeticsRevision]);

    return (
        <VoxelDogModel
            ref={modelRef}
            dogColor={record.color}
            deckColor={deckColorFromDog(record.color)}
        />
    );
}

export function RemotePlayers({ records }: { records: RemotePlayerRecord[] }) {
    const [catalogRevision, setCatalogRevision] = useState(getCosmeticCatalogRevision);

    useEffect(() => subscribeCosmeticCatalog(setCatalogRevision), []);

    return (
        <>
            {records.map((record) => (
                <RemotePlayer key={record.id} record={record} catalogRevision={catalogRevision} />
            ))}
        </>
    );
}
