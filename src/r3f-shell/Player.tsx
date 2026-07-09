import { useLayoutEffect, useRef } from 'react';
import { PLAYER_COLORS } from '../net/protocol.ts';
import type { VoxelDogParts } from '../game/types.ts';
import { VoxelDogModel, type VoxelDogModelHandle } from './VoxelDogModel.tsx';

type PlayerProps = {
    onReady: (parts: VoxelDogParts) => void;
};

export function Player({ onReady }: PlayerProps) {
    const modelRef = useRef<VoxelDogModelHandle>(null);

    useLayoutEffect(() => {
        const model = modelRef.current;
        if (!model) return;

        onReady({
            group: model.group,
            playerGroup: model.playerGroup,
            skateboard: model.skateboard,
            dog: model.dog,
            tail: model.tail,
        });
    }, [onReady]);

    return <VoxelDogModel ref={modelRef} dogColor={PLAYER_COLORS[0]!} />;
}
