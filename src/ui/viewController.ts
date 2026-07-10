/**
 * Intent-view controller — the state machine behind the "one focused view at a
 * time" rule.
 *
 * The intent layer (Shop, Rooms, Settings, Controls) is summoned by the player
 * and dims the world behind it. Only one may be open at once: opening a second
 * view first closes whatever is open, so two overlays never fight for the
 * screen. The controller owns that exclusivity as pure logic — DOM visibility
 * is delegated to the injected `show`/`hide` callbacks, so the machine is
 * testable without a document.
 */

export type ViewId = 'shop' | 'rooms' | 'settings' | 'controls';

export interface ViewBinding {
    show(): void;
    hide(): void;
}

export interface ViewController {
    /** Register a view's show/hide handlers. Re-registering replaces them. */
    register(id: ViewId, binding: ViewBinding): void;
    /** Open a view, closing any other open view first. No-op if unregistered. */
    open(id: ViewId): void;
    /** Close the currently open view, if any. */
    close(): void;
    /** Open the view if closed, close it if it is the one already open. */
    toggle(id: ViewId): void;
    /** The currently open view, or null when the player is at play. */
    current(): ViewId | null;
    /** Whether `id` is open, or (no arg) whether any view is open. */
    isOpen(id?: ViewId): boolean;
}

export function createViewController(): ViewController {
    const bindings = new Map<ViewId, ViewBinding>();
    let openId: ViewId | null = null;

    function open(id: ViewId): void {
        const binding = bindings.get(id);
        if (!binding) return; // never open a view without a home
        if (openId === id) return; // already the active view

        if (openId !== null) bindings.get(openId)?.hide();
        openId = id;
        binding.show();
    }

    function close(): void {
        if (openId === null) return;
        bindings.get(openId)?.hide();
        openId = null;
    }

    return {
        register(id, binding) {
            bindings.set(id, binding);
        },
        open,
        close,
        toggle(id) {
            if (openId === id) close();
            else open(id);
        },
        current: () => openId,
        isOpen: (id) => (id === undefined ? openId !== null : openId === id),
    };
}
