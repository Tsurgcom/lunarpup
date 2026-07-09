/**
 * Gameplay-UI suppression while a full-screen menu owns the view.
 *
 * When the main menu or pause menu is open, the dimmed backdrop should show the
 * moon, not a litter of HUD panels. Every gameplay element carries the
 * `lp-gameplay` class; toggling `lp-gameplay-hidden` on `<body>` hides them all
 * with one rule. Multiple menus can be tracked at once (they are meant to be
 * mutually exclusive, but ref-counting keeps the state correct through any
 * transition, e.g. quit-to-menu handing off from pause to main).
 *
 * The DOM target is injectable so the gating logic is testable without a real
 * document.
 */

export const GAMEPLAY_HIDDEN_CLASS = 'lp-gameplay-hidden';

export interface ClassListTarget {
    classList: {
        toggle(token: string, force?: boolean): boolean;
    };
}

const openMenus = new Set<string>();

function defaultBody(): ClassListTarget | null {
    return typeof document !== 'undefined' ? document.body : null;
}

/** Whether any tracked menu is currently holding gameplay UI hidden. */
export function isGameplayHidden(): boolean {
    return openMenus.size > 0;
}

/**
 * Record a menu as open or closed and reconcile the body class. Returns whether
 * gameplay is hidden after the change.
 */
export function setMenuOpen(
    menuId: string,
    open: boolean,
    body: ClassListTarget | null = defaultBody(),
): boolean {
    if (open) openMenus.add(menuId);
    else openMenus.delete(menuId);

    const hidden = openMenus.size > 0;
    body?.classList.toggle(GAMEPLAY_HIDDEN_CLASS, hidden);
    return hidden;
}

/** Clear all tracked menus (used by tests). */
export function resetMenuVisibility(body: ClassListTarget | null = defaultBody()): void {
    openMenus.clear();
    body?.classList.toggle(GAMEPLAY_HIDDEN_CLASS, false);
}
