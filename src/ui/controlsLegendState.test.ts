import { describe, expect, test } from 'bun:test';
import { CONTROLS_SEEN_KEY, hasSeenControls, markControlsSeen } from './controlsLegendState.ts';
import type { KeyValueStore } from './menuState.ts';

function memoryStore(): KeyValueStore & { map: Map<string, string> } {
    const map = new Map<string, string>();
    return {
        map,
        getItem: (key) => map.get(key) ?? null,
        setItem: (key, value) => {
            map.set(key, value);
        },
    };
}

const throwingStore: KeyValueStore = {
    getItem() {
        throw new Error('storage blocked');
    },
    setItem() {
        throw new Error('storage blocked');
    },
};

describe('controls-legend-seen persistence', () => {
    test('fresh store reports not seen', () => {
        expect(hasSeenControls(memoryStore())).toBe(false);
    });

    test('marking seen flips the read and stores the string "1"', () => {
        const store = memoryStore();

        markControlsSeen(store);

        expect(hasSeenControls(store)).toBe(true);
        expect(store.map.get(CONTROLS_SEEN_KEY)).toBe('1');
    });

    test('null store reports not seen and neither call throws', () => {
        expect(hasSeenControls(null)).toBe(false);
        expect(() => markControlsSeen(null)).not.toThrow();
    });

    test('throwing store is swallowed: read is false, write does not throw', () => {
        expect(hasSeenControls(throwingStore)).toBe(false);
        expect(() => markControlsSeen(throwingStore)).not.toThrow();
    });
});
