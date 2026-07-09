import { describe, expect, test } from 'bun:test';
import { hasSeenMainMenu, markMainMenuSeen, MAIN_MENU_SEEN_KEY, type KeyValueStore } from './menuState.ts';

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

describe('main-menu-seen persistence', () => {
    test('fresh store reports not seen', () => {
        expect(hasSeenMainMenu(memoryStore())).toBe(false);
    });

    test('marking seen flips the read and stores the string "1"', () => {
        const store = memoryStore();

        markMainMenuSeen(store);

        expect(hasSeenMainMenu(store)).toBe(true);
        expect(store.map.get(MAIN_MENU_SEEN_KEY)).toBe('1');
    });

    test('null store reports not seen and neither call throws', () => {
        expect(hasSeenMainMenu(null)).toBe(false);
        expect(() => markMainMenuSeen(null)).not.toThrow();
    });

    test('throwing store is swallowed: read is false, write does not throw', () => {
        expect(hasSeenMainMenu(throwingStore)).toBe(false);
        expect(() => markMainMenuSeen(throwingStore)).not.toThrow();
    });
});
