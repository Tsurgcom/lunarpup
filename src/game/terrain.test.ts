import { describe, expect, test } from 'bun:test';
import { getChunkLod, getTerrainChunkPlan } from './terrain.ts';
import { chunkSize } from '../config.ts';

describe('terrain LOD', () => {
    test('LOD tiers step down with distance at default bias', () => {
        expect(getChunkLod(0).lodName).toBe('near');
        expect(getChunkLod(1.25).lodName).toBe('near');
        expect(getChunkLod(1.26).lodName).toBe('mid');
        expect(getChunkLod(2.25).lodName).toBe('mid');
        expect(getChunkLod(2.26).lodName).toBe('far');
        expect(getChunkLod(0).segments).toBeGreaterThan(getChunkLod(3).segments);
    });

    test('LOD bias >1 keeps high detail further out; <1 drops sooner', () => {
        // At distance 2.0, default = mid. Bias 2 pushes the near boundary to 2.5 → near.
        expect(getChunkLod(2.0, 1).lodName).toBe('mid');
        expect(getChunkLod(2.0, 2).lodName).toBe('near');
        // Bias 0.5 pulls the near boundary to 0.625 → distance 1.0 drops to mid.
        expect(getChunkLod(1.0, 1).lodName).toBe('near');
        expect(getChunkLod(1.0, 0.5).lodName).toBe('mid');
    });

    test('a non-positive bias falls back to 1 (never divides detail to zero)', () => {
        expect(getChunkLod(1.0, 0).lodName).toBe('near');
        expect(getChunkLod(1.0, -5).lodName).toBe('near');
    });
});

describe('terrain chunk plan', () => {
    test('the player-centered chunk is always near, edges are far', () => {
        const plan = getTerrainChunkPlan(0, 0);
        const center = plan.find((c) => c.cx === 0 && c.cz === 0);
        expect(center?.lodName).toBe('near');
        expect(plan.some((c) => c.lodName === 'far')).toBe(true);
        // Every descriptor is uniquely keyed (cache correctness depends on this).
        expect(new Set(plan.map((c) => c.key)).size).toBe(plan.length);
    });

    test('plan recenters on the player chunk', () => {
        const plan = getTerrainChunkPlan(5 * chunkSize, -3 * chunkSize);
        const center = plan.find((c) => c.cx === 5 && c.cz === -3);
        expect(center?.lodName).toBe('near');
    });
});
