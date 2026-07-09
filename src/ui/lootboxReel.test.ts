import { describe, expect, test } from 'bun:test';
import {
    reelTransition,
    isReelBusy,
    buildReelStrip,
    type ReelItem,
    type ReelPhase,
    type ReelEvent,
} from './lootboxReel.ts';

const ITEM = (id: string): ReelItem => ({ id, name: id, rarity: 'common', colors: ['#000'] });

describe('reelTransition', () => {
    test('drives the full reveal chain idle -> glow -> spinning -> landed', () => {
        let phase: ReelPhase = 'idle';
        phase = reelTransition(phase, 'open');
        expect(phase).toBe('glow');
        phase = reelTransition(phase, 'result');
        expect(phase).toBe('spinning');
        phase = reelTransition(phase, 'settle');
        expect(phase).toBe('landed');
    });

    test('reset returns to idle from every phase', () => {
        for (const phase of ['idle', 'glow', 'spinning', 'landed'] as ReelPhase[]) {
            expect(reelTransition(phase, 'reset')).toBe('idle');
        }
    });

    // Only these three (phase,event) pairs move; every other pair is a no-op.
    const valid: Record<string, true> = {
        'idle+open': true,
        'glow+result': true,
        'spinning+settle': true,
    };
    const phases: ReelPhase[] = ['idle', 'glow', 'spinning', 'landed'];
    const events: ReelEvent[] = ['open', 'result', 'settle'];

    for (const phase of phases) {
        for (const event of events) {
            const key = `${phase}+${event}`;
            if (valid[key]) continue;
            test(`${key} is a no-op`, () => {
                expect(reelTransition(phase, event)).toBe(phase);
            });
        }
    }
});

describe('isReelBusy', () => {
    test('true only mid-flight (glow, spinning)', () => {
        expect(isReelBusy('idle')).toBe(false);
        expect(isReelBusy('glow')).toBe(true);
        expect(isReelBusy('spinning')).toBe(true);
        expect(isReelBusy('landed')).toBe(false);
    });
});

describe('buildReelStrip', () => {
    const winner = ITEM('W');
    const pool = [ITEM('A'), ITEM('B'), ITEM('C')];

    test('default length/trailing pins the winner at total-1-trailing', () => {
        const { cells, winnerIndex } = buildReelStrip(pool, winner);
        expect(cells).toHaveLength(24);
        expect(winnerIndex).toBe(24 - 1 - 2);
        expect(cells[winnerIndex]).toEqual(winner);
    });

    test('honours custom length and trailing', () => {
        const { cells, winnerIndex } = buildReelStrip(pool, winner, { length: 10, trailing: 3 });
        expect(cells).toHaveLength(10);
        expect(winnerIndex).toBe(10 - 1 - 3);
        expect(cells[winnerIndex]).toEqual(winner);
    });

    test('clamps length up to trailing+1 so the winner index stays valid', () => {
        const { cells, winnerIndex } = buildReelStrip(pool, winner, { length: 2, trailing: 5 });
        const total = Math.max(2, 5 + 1);
        expect(cells).toHaveLength(total);
        expect(winnerIndex).toBe(0);
        expect(cells[winnerIndex]).toEqual(winner);
    });

    test('empty pool falls back to the winner for every filler cell', () => {
        const { cells, winnerIndex } = buildReelStrip([], winner, { length: 5, trailing: 1 });
        expect(cells).toHaveLength(5);
        for (let i = 0; i < cells.length; i++) {
            expect(cells[i]).toEqual(winner);
        }
        expect(winnerIndex).toBe(5 - 1 - 1);
    });

    test('fills deterministically from an injected rng', () => {
        // total=4, winnerIndex=2; rng is consulted for fillers at i=0,1,3.
        const seq = [0, 0.5, 0.99];
        let i = 0;
        const rng = () => seq[i++]!;
        const { cells, winnerIndex } = buildReelStrip(pool, winner, {
            length: 4,
            trailing: 1,
            rng,
        });
        expect(winnerIndex).toBe(2);
        // floor(0*3)=0 -> A, floor(0.5*3)=1 -> B, winner, floor(0.99*3)=2 -> C
        expect(cells).toEqual([pool[0]!, pool[1]!, winner, pool[2]!]);
    });

    test('clamps an out-of-range rng to the last pool index (no undefined cells)', () => {
        const { cells } = buildReelStrip(pool, winner, {
            length: 3,
            trailing: 1,
            rng: () => 1, // floor(1*3)=3 would index past the pool
        });
        // winnerIndex = 3-1-1 = 1; fillers at 0 and 2 both clamp to last pool item.
        expect(cells[0]).toEqual(pool[pool.length - 1]!);
        expect(cells[2]).toEqual(pool[pool.length - 1]!);
    });
});
