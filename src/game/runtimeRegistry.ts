import type * as THREE from 'three';
import type { Gamemode } from '../contracts/gamemode.ts';
import type { GamemodeRuntimeState } from '../contracts/gamemode.ts';
import type { GameRuntime } from './types.ts';

export interface RuntimeFrameState {
    playerGroup: THREE.Group;
    physics: GameRuntime['physics'];
    scene: THREE.Scene;
    skateboard: THREE.Group;
}

export type RuntimeUpdateHook = (dt: number, state: RuntimeFrameState) => void;

let activeRuntime: GameRuntime | null = null;
let activeScene: THREE.Scene | null = null;
let currentGamemode: { gamemode: Gamemode; state: GamemodeRuntimeState } | null = null;
const updateHooks = new Set<RuntimeUpdateHook>();
let menuOrbitActive = false;
let menuOrbitReduced = false;

export function registerActiveRuntime(runtime: GameRuntime): () => void {
    activeRuntime = runtime;
    return () => {
        if (activeRuntime === runtime) activeRuntime = null;
    };
}

export function registerRuntimeScene(scene: THREE.Scene): () => void {
    activeScene = scene;
    return () => {
        if (activeScene === scene) activeScene = null;
    };
}

export function getActiveRuntime(): GameRuntime | null {
    return activeRuntime;
}

export function getRuntimeScene(): THREE.Scene | null {
    return activeScene;
}

export function registerUpdateHook(hook: RuntimeUpdateHook): () => void {
    updateHooks.add(hook);
    return () => updateHooks.delete(hook);
}

export function setCurrentGamemode(gamemode: Gamemode | null, state?: GamemodeRuntimeState): void {
    if (!gamemode) {
        currentGamemode = null;
        return;
    }
    if (!state) throw new Error('state is required when setting a gamemode');
    currentGamemode = { gamemode, state };
}

export function stepRuntimeExtensions(runtime: GameRuntime, dt: number): void {
    const root = runtime.parts?.playerGroup ?? runtime.parts?.group;
    if (!root || !runtime.parts || !activeScene) return;

    const frameState: RuntimeFrameState = {
        playerGroup: root,
        physics: runtime.physics,
        scene: activeScene,
        skateboard: runtime.parts.skateboard,
    };
    for (const hook of updateHooks) hook(dt, frameState);

    if (currentGamemode) {
        currentGamemode.state.elapsedMs += dt * 1000;
        void currentGamemode.gamemode.tick(dt, currentGamemode.state);
    }
}

export function setMenuOrbit(active: boolean, reduced = false): void {
    menuOrbitActive = active;
    menuOrbitReduced = reduced;
}

export function stepMenuOrbit(runtime: GameRuntime, dt: number): void {
    if (menuOrbitActive && !menuOrbitReduced) runtime.cameraControl.yaw += 0.06 * dt;
}
