import { describe, expect, test } from 'bun:test';
import { isLocalMultiplayerId } from './multiplayer.ts';

describe('isLocalMultiplayerId', () => {
    test('matches only the active local player id', () => {
        expect(isLocalMultiplayerId('abc', 'abc')).toBe(true);
        expect(isLocalMultiplayerId('abc', 'def')).toBe(false);
        expect(isLocalMultiplayerId('', 'abc')).toBe(false);
    });
});
