/**
 * Confirm-or-auto-revert modal (the Dishonored 2 "Keep these settings?"
 * pattern). A change is applied, then this modal appears over the dimmed world
 * with a visible countdown: the player explicitly Keeps it, or it reverts —
 * on Revert, on Escape, or when the countdown reaches zero.
 *
 * The countdown is a pure reducer so the keep/revert/timeout transitions are
 * testable without a DOM or real timers; `openConfirmRevert` is the thin DOM
 * shell that drives it on a 1s interval.
 */

import { prefersReducedMotion } from './motion.ts';

export type RevertStatus = 'counting' | 'kept' | 'reverted';

export interface RevertState {
    readonly remaining: number;
    readonly status: RevertStatus;
}

export const DEFAULT_REVERT_SECONDS = 12;

export function initRevert(seconds: number = DEFAULT_REVERT_SECONDS): RevertState {
    return { remaining: Math.max(0, Math.floor(seconds)), status: 'counting' };
}

/** Advance one second. At/under zero the countdown resolves to a revert. */
export function tickRevert(state: RevertState): RevertState {
    if (state.status !== 'counting') return state;
    const remaining = state.remaining - 1;
    if (remaining <= 0) return { remaining: 0, status: 'reverted' };
    return { remaining, status: 'counting' };
}

/** Explicit Keep — commits the change. No-op once already resolved. */
export function keepRevert(state: RevertState): RevertState {
    if (state.status !== 'counting') return state;
    return { remaining: state.remaining, status: 'kept' };
}

/** Explicit Revert / Escape — rolls the change back. No-op once resolved. */
export function cancelRevert(state: RevertState): RevertState {
    if (state.status !== 'counting') return state;
    return { remaining: state.remaining, status: 'reverted' };
}

export interface ConfirmRevertOptions {
    seconds?: number;
    title?: string;
    body?: string;
    keepLabel?: string;
    revertLabel?: string;
    /** Called exactly once with the outcome; the modal removes itself after. */
    onResolve(outcome: 'kept' | 'reverted'): void;
}

export interface ConfirmRevertHandle {
    /** Force-close without resolving (used when the owner tears down). */
    dispose(): void;
}

/**
 * Mount the confirm/auto-revert modal. Returns a handle whose `dispose` removes
 * it silently; normal resolution happens through `onResolve`.
 */
export function openConfirmRevert(options: ConfirmRevertOptions): ConfirmRevertHandle {
    const {
        seconds = DEFAULT_REVERT_SECONDS,
        title = 'Keep these settings?',
        body = 'Physics changed. They revert automatically if you do nothing.',
        keepLabel = 'Keep',
        revertLabel = 'Revert',
        onResolve,
    } = options;

    const reduced = prefersReducedMotion();

    const overlay = document.createElement('div');
    overlay.className = 'lp-overlay lp-confirm';
    overlay.setAttribute('role', 'alertdialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', title);
    overlay.innerHTML = `
        <div class="lp-scrim"></div>
        <div class="lp-panel lp-panel-strong lp-confirm-card">
            <h2 class="lp-panel-title">${title}</h2>
            <p class="lp-confirm-body">${body}</p>
            <span class="lp-confirm-count" aria-live="polite"></span>
            <div class="lp-confirm-actions">
                <button class="lp-button" type="button" data-revert>${revertLabel}</button>
                <button class="lp-button lp-button-primary" type="button" data-keep>${keepLabel}</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    const countEl = overlay.querySelector<HTMLElement>('.lp-confirm-count');
    const keepButton = overlay.querySelector<HTMLButtonElement>('[data-keep]');

    let state = initRevert(seconds);
    let resolved = false;
    let timer = 0;

    function paint(): void {
        if (countEl) countEl.textContent = `Reverting in ${state.remaining}s`;
    }

    function teardown(): void {
        window.clearInterval(timer);
        overlay.remove();
    }

    function resolve(outcome: 'kept' | 'reverted'): void {
        if (resolved) return;
        resolved = true;
        teardown();
        onResolve(outcome);
    }

    keepButton?.addEventListener('click', () => {
        state = keepRevert(state);
        resolve('kept');
    });
    overlay.querySelector<HTMLButtonElement>('[data-revert]')?.addEventListener('click', () => {
        state = cancelRevert(state);
        resolve('reverted');
    });
    overlay.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            state = cancelRevert(state);
            resolve('reverted');
        }
    });

    timer = window.setInterval(() => {
        state = tickRevert(state);
        paint();
        if (state.status === 'reverted') resolve('reverted');
    }, 1000);

    paint();
    if (!reduced) void overlay.offsetWidth;
    overlay.classList.add('is-visible');
    keepButton?.focus();

    return {
        dispose(): void {
            if (resolved) return;
            resolved = true;
            teardown();
        },
    };
}
