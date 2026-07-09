import { describe, expect, test } from 'bun:test';
import { FULL_TURN, MIN_GRAB_TIME, scoreTrick } from './trickScoring.ts';

describe('scoreTrick', () => {
    test('scores a clean 360', () => {
        expect(scoreTrick(FULL_TURN, 0)).toMatchObject({
            status: 'scored',
            name: '360°',
            points: 300,
            spinCount: 1,
        });
    });

    test('adds points for additional complete rotations', () => {
        expect(scoreTrick(FULL_TURN * 2, 0)).toMatchObject({
            status: 'scored',
            name: '720°',
            points: 700,
            spinCount: 2,
        });
    });

    test('scores spins in either direction', () => {
        expect(scoreTrick(-FULL_TURN, 0)).toMatchObject({
            status: 'scored',
            name: '360°',
            points: 300,
        });
    });

    test('scores a Moon Grab without a spin', () => {
        expect(scoreTrick(0, MIN_GRAB_TIME)).toMatchObject({
            status: 'scored',
            name: 'Moon Grab',
            points: 150,
        });
    });

    test('applies the combination multiplier', () => {
        expect(scoreTrick(FULL_TURN, MIN_GRAB_TIME)).toMatchObject({
            status: 'scored',
            name: '360° Moon Grab',
            points: 675,
        });
    });

    test('rejects an incomplete spin', () => {
        expect(scoreTrick(FULL_TURN * 0.75, MIN_GRAB_TIME)).toMatchObject({
            status: 'sketchy',
            points: 0,
        });
    });

    test('ignores an ordinary jump', () => {
        expect(scoreTrick(0, 0)).toMatchObject({
            status: 'none',
            points: 0,
        });
    });
});
