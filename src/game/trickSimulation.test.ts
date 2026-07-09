import { describe, expect, test } from 'bun:test';
import { FULL_TURN, MIN_GRAB_TIME } from './trickScoring.ts';
import {
    createTrickSimulation,
    finishTrickSimulation,
    SPIN_SPEED,
    startTrickSimulation,
    stepTrickSimulation,
} from './trickSimulation.ts';

describe('trickSimulation', () => {
    test('starts a trick with zero rotation and grab time', () => {
        const state = createTrickSimulation();
        startTrickSimulation(state);

        expect(state).toMatchObject({
            active: true,
            rotation: 0,
            grabTime: 0,
            grabbing: false,
        });
    });

    test('accumulates spin in the requested direction while airborne', () => {
        const state = createTrickSimulation();
        startTrickSimulation(state);

        const pose = stepTrickSimulation(state, { spinDirection: 1, grabbing: false }, 0.5);
        expect(state.rotation).toBeCloseTo(SPIN_SPEED * 0.5);
        expect(pose.rotation).toBeCloseTo(SPIN_SPEED * 0.5);
        expect(pose.dogTargetY).toBe(0.15);
    });

    test('tracks grab time and grab pose targets', () => {
        const state = createTrickSimulation();
        startTrickSimulation(state);

        stepTrickSimulation(state, { spinDirection: 0, grabbing: true }, 0.4);
        const pose = stepTrickSimulation(state, { spinDirection: 0, grabbing: true }, 0.1);

        expect(state.grabTime).toBeCloseTo(0.5);
        expect(pose.dogTargetY).toBe(-0.08);
        expect(pose.dogTargetTilt).toBe(-0.22);
    });

    test('settles rotation toward zero when inactive', () => {
        const state = createTrickSimulation();
        const pose = stepTrickSimulation(state, { spinDirection: 0, grabbing: false }, 1 / 60, Math.PI / 2);

        expect(pose.settling).toBe(true);
        expect(pose.rotation).toBeLessThan(Math.PI / 2);
        expect(pose.rotation).toBeGreaterThan(0);
    });

    test('scores a completed trick and updates total score', () => {
        const state = createTrickSimulation();
        startTrickSimulation(state);
        state.rotation = FULL_TURN;
        state.grabTime = MIN_GRAB_TIME;

        const result = finishTrickSimulation(state);
        expect(result).toMatchObject({
            status: 'scored',
            points: 675,
        });
        expect(state.totalScore).toBe(675);
        expect(state.active).toBe(false);
    });

    test('ignores finish when no trick is active', () => {
        const state = createTrickSimulation();
        expect(finishTrickSimulation(state)).toBeNull();
    });
});
