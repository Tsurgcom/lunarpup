/**
 * Persistence for whether the player has dismissed the first-run controls
 * legend. First-time players see the legend once; afterwards it only appears on
 * demand (the ? hotkey or Settings). Mirrors `menuState.ts`: the store is
 * injectable so the decision is testable without a real `localStorage`.
 */

import type { KeyValueStore } from './menuState.ts';

export const CONTROLS_SEEN_KEY = 'lunarpup:controlsSeen';

function defaultStore(): KeyValueStore | null {
    try {
        return globalThis.localStorage ?? null;
    } catch {
        // Accessing localStorage can throw (privacy mode, sandboxed iframe).
        return null;
    }
}

export function hasSeenControls(store: KeyValueStore | null = defaultStore()): boolean {
    if (!store) return false;
    try {
        return store.getItem(CONTROLS_SEEN_KEY) === '1';
    } catch {
        return false;
    }
}

export function markControlsSeen(store: KeyValueStore | null = defaultStore()): void {
    if (!store) return;
    try {
        store.setItem(CONTROLS_SEEN_KEY, '1');
    } catch {
        // Best-effort; a failed write just means the legend shows again next load.
    }
}
