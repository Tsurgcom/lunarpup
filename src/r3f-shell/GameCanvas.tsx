import { useCallback, useEffect, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import type * as THREE from 'three';
import { bootstrap } from '../game/bootstrap.ts';
import { handleKeys } from '../game/input.ts';
import { stepGameFrame } from '../game/loop.ts';
import type { VoxelDogParts } from '../game/player.ts';
import { Player } from './Player.tsx';
import { WorldEnvironment } from './WorldEnvironment.tsx';

function useGameInput() {
    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => handleKeys(event, true);
        const onKeyUp = (event: KeyboardEvent) => handleKeys(event, false);
        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);

        return () => {
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('keyup', onKeyUp);
        };
    }, []);
}

function GameRuntime({ player }: { player: VoxelDogParts }) {
    const { scene, camera, gl } = useThree();
    useFrame((_, delta) => {
        if (ready.current) stepGameFrame(Math.min(delta, 0.05));
    });
    const ready = useRef(false);

    useGameInput();

    useEffect(() => {
        let disposed = false;
        let cleanup: (() => void) | undefined;

        void bootstrap({
            r3fHost: { scene, camera: camera as THREE.PerspectiveCamera, renderer: gl },
            r3fPlayer: player,
        }).then((dispose) => {
            cleanup = dispose;
            if (disposed) cleanup();
            else ready.current = true;
        }).catch((error) => {
            console.error('R3F game bootstrap failed', error);
        });

        return () => {
            disposed = true;
            ready.current = false;
            cleanup?.();
        };
    }, [camera, gl, player, scene]);

    return null;
}

function GameScene() {
    const [player, setPlayer] = useState<VoxelDogParts | null>(null);
    const onPlayerReady = useCallback((parts: VoxelDogParts) => setPlayer(parts), []);

    return (
        <>
            <WorldEnvironment />
            <Player onReady={onPlayerReady} />
            {player && <GameRuntime player={player} />}
        </>
    );
}

function GameHost() {
    return (
        <Canvas camera={{ fov: 60, near: 0.1, far: 2500 }} gl={{ antialias: true, powerPreference: 'high-performance' }} dpr={[1, 2]} shadows>
            <GameScene />
        </Canvas>
    );
}

export function GameCanvas() {
    return <GameHost />;
}
