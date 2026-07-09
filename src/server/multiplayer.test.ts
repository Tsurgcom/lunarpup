import { describe, expect, test } from 'bun:test';
import { shouldDropChat } from './multiplayer.ts';

describe('shouldDropChat', () => {
    test('first message is always allowed', () => {
        expect(shouldDropChat(undefined, 'hi', 10_000)).toBe(false);
    });

    test('rate-limits a second message under 1s later, even with different text', () => {
        const recent = { text: 'hi', ts: 10_000 };
        expect(shouldDropChat(recent, 'different', 10_999)).toBe(true);
    });

    test('allows a different message at exactly 1000ms (strict boundary)', () => {
        const recent = { text: 'hi', ts: 10_000 };
        expect(shouldDropChat(recent, 'different', 11_000)).toBe(false);
    });

    test('dedupes identical text within 3s once past the rate limit', () => {
        const recent = { text: 'hi', ts: 10_000 };
        expect(shouldDropChat(recent, 'hi', 11_500)).toBe(true);
    });

    test('allows identical text at exactly 3000ms (strict boundary)', () => {
        const recent = { text: 'hi', ts: 10_000 };
        expect(shouldDropChat(recent, 'hi', 13_000)).toBe(false);
    });

    test('allows different text between 1s and 3s', () => {
        const recent = { text: 'hi', ts: 10_000 };
        expect(shouldDropChat(recent, 'different', 11_500)).toBe(false);
    });
});
