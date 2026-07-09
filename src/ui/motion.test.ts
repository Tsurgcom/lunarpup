import { describe, expect, test } from 'bun:test';
import { prefersReducedMotion, REDUCED_MOTION_QUERY, type MediaMatcher } from './motion.ts';

describe('prefersReducedMotion decision', () => {
    test('returns true when the matcher matches', () => {
        expect(prefersReducedMotion(() => ({ matches: true }))).toBe(true);
    });

    test('returns false when the matcher does not match', () => {
        expect(prefersReducedMotion(() => ({ matches: false }))).toBe(false);
    });

    test('queries the matcher with the reduced-motion media query', () => {
        const queries: string[] = [];
        const matcher: MediaMatcher = (query) => {
            queries.push(query);
            return { matches: true };
        };

        prefersReducedMotion(matcher);

        expect(queries).toEqual([REDUCED_MOTION_QUERY]);
    });

    test('null matcher returns false without throwing', () => {
        expect(prefersReducedMotion(null)).toBe(false);
    });

    test('a throwing matcher is swallowed and returns false', () => {
        const matcher: MediaMatcher = () => {
            throw new Error('matchMedia unavailable');
        };
        expect(prefersReducedMotion(matcher)).toBe(false);
    });
});
