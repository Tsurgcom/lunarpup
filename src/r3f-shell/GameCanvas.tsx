import { Component, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { handleKeys } from '../game/input.ts';
import { stepSimulation } from '../game/simulation.ts';
import { lerpRemotePlayers } from '../game/remotePlayerMotion.ts';
import { setupCameraControls, updateCamera } from '../game/camera.ts';
import { useGame } from './GameProvider.tsx';
import { CameraRig } from './CameraRig.tsx';
import { Player } from './Player.tsx';
import { RemotePlayers } from './RemotePlayers.tsx';
import { Terrain } from './Terrain.tsx';
import { WorldEnvironment } from './WorldEnvironment.tsx';
import type { VoxelDogParts } from '../game/types.ts';

function useGameInput() {
    const { runtime } = useGame();

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => handleKeys(runtime.current, event, true);
        const onKeyUp = (event: KeyboardEvent) => handleKeys(runtime.current, event, false);
        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);

        return () => {
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('keyup', onKeyUp);
        };
    }, [runtime]);
}

function GameRuntime() {
    const { runtime, ready, remotePlayersRef } = useGame();

    useFrame((_, delta) => {
        if (!ready.current) return;
        const dt = Math.min(delta, 0.05);
        lerpRemotePlayers(remotePlayersRef.current, dt);
        stepSimulation(runtime.current, dt);
    }, -1);

    useGameInput();

    return null;
}

function RendererSetup() {
    const { gl } = useThree();

    useEffect(() => {
        gl.shadowMap.enabled = true;
        gl.shadowMap.type = THREE.PCFSoftShadowMap;
    }, [gl]);

    return null;
}

function GameScene() {
    const { registerPlayerParts, remotePlayersRef, remotePlayerIds } = useGame();
    const [player, setPlayer] = useState<VoxelDogParts | null>(null);
    const onPlayerReady = useCallback((parts: VoxelDogParts) => {
        registerPlayerParts(parts);
        setPlayer(parts);
    }, [registerPlayerParts]);

    const remoteRecords = useMemo(
        () => remotePlayerIds
            .map((id) => remotePlayersRef.current.get(id))
            .filter((record): record is NonNullable<typeof record> => !!record),
        [remotePlayerIds, remotePlayersRef],
    );

    return (
        <>
            <RendererSetup />
            <WorldEnvironment />
            <Player onReady={onPlayerReady} />
            {player && <Terrain player={player} />}
            <RemotePlayers records={remoteRecords} />
            {player && <GameRuntime />}
            <CameraRig />
        </>
    );
}

function GameHost() {
    return (
        <Canvas
            camera={{ fov: 60, near: 0.1, far: 2500 }}
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
