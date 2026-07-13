import { describe, expect, test } from 'bun:test';
import { sanitizePlayerState } from './stateSanitize.ts';

const base = {
    x: 1, y: 2, z: 3,
    qx: 0, qy: 0, qz: 0, qw: 1,
    heading: 0.5, speed: 4,
    isGrounded: true,
    boardTiltX: 0.1, boardTiltZ: -0.1,
};

describe('sanitizePlayerState', () => {
    test('passes through finite values', () => {
        expect(sanitizePlayerState(base)).toEqual(base);
    });

    test('coerces NaN and Infinity to safe defaults', () => {
        const sanitized = sanitizePlayerState({
            ...base,
            x: NaN,
            y: Infinity,
            z: -Infinity,
            qw: NaN,
        });
        expect(sanitized.x).toBe(0);
        expect(sanitized.y).toBe(0);
        expect(sanitized.z).toBe(0);
        expect(sanitized.qw).toBe(1);
    });

    test('clamps extreme coordinates', () => {
        const sanitized = sanitizePlayerState({ ...base, x: 9e9, z: -9e9 });
        expect(sanitized.x).toBe(1e6);
        expect(sanitized.z).toBe(-1e6);
    });
});
