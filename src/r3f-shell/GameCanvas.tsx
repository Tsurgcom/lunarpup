import { Component, useCallback, useEffect, useRef, useState } from 'react';
import type { ErrorInfo, MutableRefObject, ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import type * as THREE from 'three';
import { bootstrap } from '../game/bootstrap.ts';
import { handleKeys } from '../game/input.ts';
import { stepGameFrame } from '../game/loop.ts';
import type { VoxelDogParts } from '../game/player.ts';
import { CameraRig } from './CameraRig.tsx';
import { Player } from './Player.tsx';
import { Terrain } from './Terrain.tsx';
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

function GameRuntime({ player, ready }: { player: VoxelDogParts; ready: MutableRefObject<boolean> }) {
    const { scene, camera, gl } = useThree();
    useFrame((_, delta) => {
        if (ready.current) stepGameFrame(Math.min(delta, 0.05), { updateCamera: false });
    }, -1);

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
    const ready = useRef(false);
    const onPlayerReady = useCallback((parts: VoxelDogParts) => setPlayer(parts), []);

    return (
        <>
            <WorldEnvironment />
            <Player onReady={onPlayerReady} />
            {player && <Terrain player={player} />}
            {player && <GameRuntime player={player} ready={ready} />}
            <CameraRig ready={ready} />
        </>
    );
}

function GameHost() {
    return (
        <Canvas
            camera={{ fov: 60, near: 0.1, far: 2500 }}
            fallback={<WebGLFallback />}
            gl={{ antialias: true, powerPreference: 'high-performance' }}
            dpr={[1, 2]}
            shadows
        >
            <GameScene />
        </Canvas>
    );
}

function WebGLFallback({ error }: { error?: unknown }) {
    return (
        <section className="r3f-fallback" role="alert">
            <h2>Moon needs WebGL</h2>
            <p>Enable hardware acceleration or update browser/GPU drivers, then reload.</p>
            {error instanceof Error && <p className="r3f-fallback-detail">{error.message}</p>}
            <button type="button" onClick={() => window.location.reload()}>Reload game</button>
        </section>
    );
}

type CanvasBoundaryProps = { children: ReactNode };
type CanvasBoundaryState = { error: unknown | null };

class CanvasErrorBoundary extends Component<CanvasBoundaryProps, CanvasBoundaryState> {
    override state: CanvasBoundaryState = { error: null };

    static getDerivedStateFromError(error: unknown): CanvasBoundaryState {
        return { error };
    }

    override componentDidCatch(error: Error, info: ErrorInfo) {
        console.error('R3F canvas crashed', error, info.componentStack);
    }

    override render() {
        if (this.state.error) return <WebGLFallback error={this.state.error} />;
        return this.props.children;
    }
}

export function GameCanvas() {
    return <CanvasErrorBoundary><GameHost /></CanvasErrorBoundary>;
}
