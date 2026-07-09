import type { GameRuntime } from './types.ts';
import {
    finishTrickSimulation,
    startTrickSimulation,
    stepTrickSimulation,
} from './trickSimulation.ts';

export function startTrick(runtime: GameRuntime) {
    startTrickSimulation(runtime.trickState);
}

export function updateTrick(runtime: GameRuntime, dt: number) {
    const { parts, keys, trickState, frameHud } = runtime;
    if (!parts) return;

    const pose = stepTrickSimulation(
        trickState,
        {
            spinDirection: Number(keys.q) - Number(keys.e),
            grabbing: keys.f,
        },
        dt,
        parts.group.rotation.y,
    );

    parts.group.rotation.y = pose.rotation;
    frameHud.updateCurrentTrick?.(trickState.active ? trickState.rotation : 0, trickState.grabbing);

    const crouch = 1 - Math.exp(-14 * dt);
    parts.dog.position.y += (pose.dogTargetY - parts.dog.position.y) * crouch;
    parts.dog.rotation.x += (pose.dogTargetTilt - parts.dog.rotation.x) * crouch;
}

export function finishTrick(runtime: GameRuntime) {
    const result = finishTrickSimulation(runtime.trickState);
    if (!result) return;

    if (result.status === 'scored') {
        runtime.frameHud.updateTrickScore?.(runtime.trickState.totalScore);
    }
    runtime.frameHud.showTrickResult?.(result);
    if (runtime.parts) runtime.parts.group.rotation.y = runtime.trickState.rotation;
}
