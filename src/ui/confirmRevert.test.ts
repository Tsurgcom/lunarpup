import { describe, expect, test } from 'bun:test';
import {
    initRevert,
    tickRevert,
    keepRevert,
    cancelRevert,
    DEFAULT_REVERT_SECONDS,
    type RevertState,
} from './confirmRevert.ts';

describe('initRevert', () => {
    test('defaults to DEFAULT_REVERT_SECONDS, counting', () => {
        expect(initRevert()).toEqual({ remaining: DEFAULT_REVERT_SECONDS, status: 'counting' });
    });

    test('clamps negative seconds to 0', () => {
        expect(initRevert(-5)).toEqual({ remaining: 0, status: 'counting' });
    });

    test('floors fractional seconds', () => {
        expect(initRevert(12.9).remaining).toBe(12);
        expect(initRevert(3.2).remaining).toBe(3);
    });
});

describe('revert countdown timing', () => {
    for (const n of [1, 2, 3, 12]) {
        test(`init(${n}) reverts after exactly ${n} ticks, not sooner`, () => {
            let state = initRevert(n);
            // Every tick before the last leaves it counting.
            for (let i = 0; i < n - 1; i++) {
                state = tickRevert(state);
                expect(state.status).toBe('counting');
            }
            // One tick short of the deadline: still alive with a second on the clock.
            expect(state).toEqual({ remaining: 1, status: 'counting' });
            // The Nth tick resolves to reverted at exactly zero.
            state = tickRevert(state);
            expect(state).toEqual({ remaining: 0, status: 'reverted' });
        });
    }

    test('init(0) reverts on the first tick', () => {
        expect(tickRevert(initRevert(0))).toEqual({ remaining: 0, status: 'reverted' });
    });

    test('tick past resolution stays reverted at zero', () => {
        const reverted = tickRevert(initRevert(1));
        expect(tickRevert(reverted)).toEqual({ remaining: 0, status: 'reverted' });
    });
});

describe('keepRevert', () => {
    test('counting -> kept, preserving remaining', () => {
        expect(keepRevert({ remaining: 7, status: 'counting' })).toEqual({
            remaining: 7,
            status: 'kept',
        });
    });

    test('is terminal: kept stays kept, further ticks/keep/cancel are no-ops', () => {
        const kept = keepRevert(initRevert(5));
        expect(tickRevert(kept)).toBe(kept);
        expect(keepRevert(kept)).toBe(kept);
        expect(cancelRevert(kept)).toBe(kept);
    });
});

describe('cancelRevert', () => {
    test('counting -> reverted, preserving remaining', () => {
        expect(cancelRevert({ remaining: 4, status: 'counting' })).toEqual({
            remaining: 4,
            status: 'reverted',
        });
    });

    test('is terminal: reverted stays reverted, further keep/cancel/tick are no-ops', () => {
        const reverted = cancelRevert(initRevert(5));
        expect(keepRevert(reverted)).toBe(reverted);
        expect(cancelRevert(reverted)).toBe(reverted);
        expect(tickRevert(reverted)).toBe(reverted);
    });
});
