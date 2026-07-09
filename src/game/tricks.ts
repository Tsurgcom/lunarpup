import { dog, keys, trickRoot } from '../state.ts';
import { showTrickResult, updateCurrentTrick, updateTrickScore } from '../ui/tricks.ts';
import {
    createTrickSimulation,
    finishTrickSimulation,
    startTrickSimulation,
    stepTrickSimulation,
} from './trickSimulation.ts';

const trickState = createTrickSimulation();

export function startTrick() {
    startTrickSimulation(trickState);
}

export function updateTrick(dt: number) {
    const pose = stepTrickSimulation(
        trickState,
        {
            spinDirection: Number(keys.q) - Number(keys.e),
            grabbing: keys.f,
        },
        dt,
        trickRoot.rotation.y,
    );

    trickRoot.rotation.y = pose.rotation;
    updateCurrentTrick(trickState.active ? trickState.rotation : 0, trickState.grabbing);

    const crouch = 1 - Math.exp(-14 * dt);
    dog.position.y += (pose.dogTargetY - dog.position.y) * crouch;
    dog.rotation.x += (pose.dogTargetTilt - dog.rotation.x) * crouch;
}

export function finishTrick() {
    const result = finishTrickSimulation(trickState);
    if (!result) return;

    if (result.status === 'scored') updateTrickScore(trickState.totalScore);
    showTrickResult(result);
    trickRoot.rotation.y = trickState.rotation;
}
