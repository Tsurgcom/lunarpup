import { scoreTrick, type TrickScore } from './trickScoring.ts';

export const SPIN_SPEED = Math.PI * 2 * 1.2;
export const DOG_REST_Y = 0.15;
export const DOG_GRAB_Y = -0.08;

export interface TrickSimulationState {
    active: boolean;
    rotation: number;
    grabTime: number;
    grabbing: boolean;
    totalScore: number;
}

export interface TrickInput {
    spinDirection: number;
    grabbing: boolean;
}

export interface TrickPoseTargets {
    rotation: number;
    dogTargetY: number;
    dogTargetTilt: number;
    settling: boolean;
}

export function createTrickSimulation(): TrickSimulationState {
    return {
        active: false,
        rotation: 0,
        grabTime: 0,
        grabbing: false,
        totalScore: 0,
    };
}

export function startTrickSimulation(state: TrickSimulationState) {
    state.active = true;
    state.rotation = 0;
    state.grabTime = 0;
    state.grabbing = false;
}

export function stepTrickSimulation(
    state: TrickSimulationState,
    input: TrickInput,
    dt: number,
    currentRotation = 0,
): TrickPoseTargets {
    if (state.active) {
        state.rotation += input.spinDirection * SPIN_SPEED * dt;
        state.grabbing = input.grabbing;
        if (state.grabbing) state.grabTime += dt;

        return {
            rotation: state.rotation,
            dogTargetY: state.grabbing ? DOG_GRAB_Y : DOG_REST_Y,
            dogTargetTilt: state.grabbing ? -0.22 : 0,
            settling: false,
        };
    }

    const settle = 1 - Math.exp(-16 * dt);
    const rotation = currentRotation + (0 - currentRotation) * settle;

    return {
        rotation,
        dogTargetY: DOG_REST_Y,
        dogTargetTilt: 0,
        settling: true,
    };
}

export function finishTrickSimulation(state: TrickSimulationState): TrickScore | null {
    if (!state.active) return null;

    const result = scoreTrick(state.rotation, state.grabTime);
    if (result.status === 'scored') state.totalScore += result.points;

    state.active = false;
    state.grabbing = false;
    state.rotation = normalizeAngle(state.rotation);

    return result;
}

export function normalizeAngle(angle: number) {
    return Math.atan2(Math.sin(angle), Math.cos(angle));
}
