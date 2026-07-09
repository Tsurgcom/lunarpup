/** Shared keyboard/navigation helpers for the full-screen menus. */

/**
 * Move focus among a vertical menu's items in response to an arrow key.
 * Wraps at both ends. Returns true if the key was a navigation key and was
 * handled, so the caller can `preventDefault()`.
 */
export function handleArrowNav(items: HTMLElement[], event: KeyboardEvent): boolean {
    if (items.length === 0) return false;

    const active = document.activeElement as HTMLElement | null;
    const current = active ? items.indexOf(active) : -1;

    let next: number;
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
        next = current < 0 ? 0 : (current + 1) % items.length;
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
        next = current <= 0 ? items.length - 1 : current - 1;
    } else {
        return false;
    }

    items[next]?.focus();
    return true;
}

/**
 * Bring an existing HUD panel to the player's attention: scroll it into view,
 * flash a focus ring, and focus its first control. Used by the menus' "open the
 * existing panel" actions (Rooms / Cosmetics / Settings).
 */
export function revealPanel(id: string): void {
    const panel = document.getElementById(id);
    if (!panel) return;

    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    panel.classList.add('lp-panel-focus');
    window.setTimeout(() => panel.classList.remove('lp-panel-focus'), 1600);

    const focusable = panel.querySelector<HTMLElement>(
        'button, input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    focusable?.focus();
}
