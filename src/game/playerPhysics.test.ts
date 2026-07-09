import { describe, expect, test } from 'bun:test';
import {
    canCoyoteJump,
    consumeJumpRequest,
    COYOTE_TIME_MS,
    JUMP_BUFFER_MS,
    stepDriveSpeed,
    stepHeading,
    wantsJump,
} from './playerPhysics.ts';

describe('playerPhysics jump helpers', () => {
    test('accepts a held space press', () => {
        expect(wantsJump({ spaceHeld: true, queuedAt: 0 }, 1000)).toBe(true);
    });

    test('accepts a buffered jump inside the window', () => {
        const now = 1000;
        expect(wantsJump({ spaceHeld: false, queuedAt: now - 100 }, now)).toBe(true);
    });

    test('rejects an expired buffered jump', () => {
        const now = 1000;
        expect(wantsJump({ spaceHeld: false, queuedAt: now - JUMP_BUFFER_MS - 1 }, now)).toBe(false);
    });

    test('clears buffered jump requests after consumption', () => {
        const input = { spaceHeld: false, queuedAt: 500 };
        consumeJumpRequest(input);
        expect(input.queuedAt).toBe(0);
    });

    test('allows coyote jumps shortly after leaving the ground', () => {
        expect(canCoyoteJump(false, COYOTE_TIME_MS / 2000)).toBe(true);
        expect(canCoyoteJump(false, (COYOTE_TIME_MS + 1) / 1000)).toBe(false);
        expect(canCoyoteJump(true, 0)).toBe(false);
    });
});

describe('playerPhysics drive helpers', () => {
    const basePhysics = {
        speed: 0,
        maxSpeed: 1,
        accel: 0.1,
        decel: 0.05,
        boostMultiplier: 2,
        boostAccelMultiplier: 2,
    };

    test('accelerates forward and caps at max speed', () => {
        const physics = { ...basePhysics };
        stepDriveSpeed(physics, { forward: true, reverse: false, boosting: false }, 1);
        expect(physics.speed).toBeCloseTo(0.1);

        stepDriveSpeed(physics, { forward: true, reverse: false, boosting: false }, 20);
        expect(physics.speed).toBeCloseTo(1);
    });

    test('applies boost acceleration and max speed', () => {
        const physics = { ...basePhysics };
        stepDriveSpeed(physics, { forward: true, reverse: false, boosting: true }, 20);
        expect(physics.speed).toBeCloseTo(2);
    });

    test('brakes in reverse and coasts to a stop', () => {
        const physics = { ...basePhysics, speed: 0.4 };
        stepDriveSpeed(physics, { forward: false, reverse: true, boosting: false }, 1);
        expect(physics.speed).toBeCloseTo(0.3);

        stepDriveSpeed(physics, { forward: false, reverse: false, boosting: false }, 10);
        expect(physics.speed).toBe(0);
    });

    test('turns left and right independently', () => {
        expect(stepHeading(0, 0.1, true, false, 1)).toBeCloseTo(0.1);
        expect(stepHeading(0, 0.1, false, true, 1)).toBeCloseTo(-0.1);
        expect(stepHeading(1, 0.1, true, true, 1)).toBeCloseTo(1);
    });
});
