/**
 * Hotkey routing for the intent layer.
 *
 * C / R / T / ? summon Shop / Rooms / Settings / Controls. Routing is pure so
 * it can be tested without a keyboard event or DOM: `hotkeyForKey` maps a
 * `KeyboardEvent.key` to a view (or null), and `isTypingTarget` guards against
 * firing a hotkey while the player is typing into a field (chat, room name,
 * tuning input).
 */

import type { ViewId } from './viewController.ts';

const VIEW_BY_KEY: Record<string, ViewId> = {
    c: 'shop',
    r: 'rooms',
    t: 'settings',
    '?': 'controls',
};

/** The intent view a key opens, or null when the key is not a view hotkey. */
export function hotkeyForKey(key: string): ViewId | null {
    return VIEW_BY_KEY[key.toLowerCase()] ?? null;
}

/**
 * Whether an event target is a text-entry control that should swallow letter
 * keys instead of routing them as hotkeys.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
    const el = target as (HTMLElement & { tagName?: string }) | null;
    if (!el || typeof el.tagName !== 'string') return false;
    if (el.isContentEditable) return true;
    const tag = el.tagName.toUpperCase();
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}
