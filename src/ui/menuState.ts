/**
 * Persistence for whether the player has seen (and dismissed) the main menu.
 * Returning players skip straight into the game and reopen the menu via the
 * small menu button. Storage is injectable so the logic is testable without a
 * real `localStorage`.
 */

export const MAIN_MENU_SEEN_KEY = 'lunarpup:mainMenuSeen';

export interface KeyValueStore {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}

function defaultStore(): KeyValueStore | null {
    try {
        return globalThis.localStorage ?? null;
    } catch {
        // Accessing localStorage can throw (privacy mode, sandboxed iframe).
        return null;
    }
}

export function hasSeenMainMenu(store: KeyValueStore | null = defaultStore()): boolean {
    if (!store) return false;
    try {
        return store.getItem(MAIN_MENU_SEEN_KEY) === '1';
    } catch {
        return false;
    }
}

export function markMainMenuSeen(store: KeyValueStore | null = defaultStore()): void {
    if (!store) return;
    try {
        store.setItem(MAIN_MENU_SEEN_KEY, '1');
    } catch {
        // Best-effort; a failed write just means the menu shows again next load.
    }
}
