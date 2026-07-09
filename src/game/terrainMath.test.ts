import { describe, expect, test } from 'bun:test';
import { calculateTerrainHeight } from './terrainMath.ts';

describe('calculateTerrainHeight', () => {
    test('returns a stable height for the same coordinates', () => {
        expect(calculateTerrainHeight(120, -340)).toBe(calculateTerrainHeight(120, -340));
    });

    test.each([
        { x: 0, z: 0, expected: 10.03724922500729 },
        { x: 120, z: -340, expected: 60.187584552641816 },
        { x: 720, z: 560, expected: 22.455596019685704 },
        { x: -1024, z: 2048, expected: 30.913507418734802 },
    ])('preserves the terrain shape at ($x, $z)', ({ x, z, expected }) => {
        expect(calculateTerrainHeight(x, z)).toBe(expected);
    });
});
