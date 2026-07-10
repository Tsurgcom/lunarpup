import { describe, expect, test } from 'bun:test';
import { isDevMode } from './devFlag.ts';

describe('isDevMode', () => {
    const cases: Array<[string, boolean]> = [
        ['?dev=1', true],
        ['?dev=true', true],
        ['?dev', true], // bare flag, empty value
        ['', false],
        ['?dev=0', false],
        ['?dev=false', false],
        ['?other=1', false],
        ['?multiplayer&dev=1', true], // dev present among other params
    ];

    for (const [search, expected] of cases) {
        test(`${JSON.stringify(search)} -> ${expected}`, () => {
            expect(isDevMode(search)).toBe(expected);
        });
    }
});
