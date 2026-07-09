import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { sha256Hex } from './sha256.ts';

describe('sha256Hex', () => {
    test('matches known vectors', () => {
        expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
        expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    });

    test('matches node:crypto across lengths, multi-block and unicode inputs', () => {
        const inputs = [
            'a',
            'lunar pup',
            'x'.repeat(55), // padding boundary
            'x'.repeat(56),
            'x'.repeat(64), // exactly one block
            'x'.repeat(1000), // multi-block
            '🐶 moon skating ünïcödé',
            JSON.stringify({ kind: 'cosmetic', version: '1.0.0', nested: { a: [1, 2, 3] } }),
        ];
        for (const input of inputs) {
            const expected = createHash('sha256').update(input, 'utf8').digest('hex');
            expect(sha256Hex(input)).toBe(expected);
        }
    });
});
