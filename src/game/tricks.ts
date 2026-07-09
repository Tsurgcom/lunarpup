import { dog, keys, trickRoot } from '../state.ts';
import { showTrickResult, updateCurrentTrick, updateTrickScore } from '../ui/tricks.ts';
import { scoreTrick } from './trickScoring.ts';

const SPIN_SPEED = Math.PI * 2 * 1.2;
const DOG_REST_Y = 0.15;
const DOG_GRAB_Y = -0.08;

const trickState = {
    active: false,
    rotation: 0,
    grabTime: 0,
    grabbing: false,
    totalScore: 0,
};

export function startTrick() {
    trickState.active = true;
    trickState.rotation = 0;
    trickState.grabTime = 0;
    trickState.grabbing = false;
}

export function updateTrick(dt: number) {
    if (trickState.active) {
        const spinDirection = Number(keys.q) - Number(keys.e);
        trickState.rotation += spinDirection * SPIN_SPEED * dt;
        trickState.grabbing = keys.f;
        if (trickState.grabbing) trickState.grabTime += dt;

        trickRoot.rotation.y = trickState.rotation;
        updateCurrentTrick(trickState.rotation, trickState.grabbing);
    } else {
        const settle = 1 - Math.exp(-16 * dt);
        trickRoot.rotation.y += (0 - trickRoot.rotation.y) * settle;
        updateCurrentTrick(0, false);
    }

    const crouch = 1 - Math.exp(-14 * dt);
    const targetDogY = trickState.active && trickState.grabbing ? DOG_GRAB_Y : DOG_REST_Y;
    const targetDogTilt = trickState.active && trickState.grabbing ? -0.22 : 0;
    dog.position.y += (targetDogY - dog.position.y) * crouch;
    dog.rotation.x += (targetDogTilt - dog.rotation.x) * crouch;
}

export function finishTrick() {
    if (!trickState.active) return;

    const result = scoreTrick(trickState.rotation, trickState.grabTime);
    if (result.status === 'scored') {
        trickState.totalScore += result.points;
        updateTrickScore(trickState.totalScore);
    }
    showTrickResult(result);

    trickState.active = false;
    trickState.grabbing = false;
    trickRoot.rotation.y = normalizeAngle(trickRoot.rotation.y);
}

function normalizeAngle(angle: number) {
    return Math.atan2(Math.sin(angle), Math.cos(angle));
}
