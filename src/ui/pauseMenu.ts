import { prefersReducedMotion, REDUCED_MOTION_CLASS } from './motion.ts';
import { handleArrowNav } from './menuNav.ts';
import { pauseController } from '../game/pause.ts';
import { setMenuOpen } from './hudVisibility.ts';

export interface PauseMenuActions {
    /** Close the pause menu and reveal the settings/tuning panel. */
    openSettings(): void;
    /** Leave the current session back to the main menu. */
    quitToMenu(): void;
    /** Whether the pause menu is allowed to open right now (e.g. main menu closed). */
    canOpen(): boolean;
}

export interface PauseMenuHandle {
    show(): void;
    hide(): void;
    toggle(): void;
    isOpen(): boolean;
}

const EXIT_MS = 240; // keep in sync with --dur-base

export function setupPauseMenu(actions: PauseMenuActions): PauseMenuHandle {
    const overlay = document.createElement('div');
    overlay.id = 'pause-menu';
    overlay.className = 'lp-overlay pause-menu';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Paused');
    overlay.hidden = true;
    overlay.innerHTML = `
        <div class="lp-scrim pause-scrim"></div>
        <div class="pause-orrery" aria-hidden="true">
            <span class="pause-ring pause-ring-1"></span>
            <span class="pause-ring pause-ring-2"></span>
            <span class="pause-ring pause-ring-3"></span>
            <span class="pause-core"></span>
        </div>
        <div class="pause-content">
            <p class="pause-eyebrow">PAUSED</p>
            <nav class="pause-nav" role="menu" aria-label="Pause menu">
                <button class="pause-item" type="button" role="menuitem" data-action="resume" style="--i: 0"><span class="pause-dot"></span>Resume</button>
                <button class="pause-item" type="button" role="menuitem" data-action="settings" style="--i: 1"><span class="pause-dot"></span>Settings</button>
                <button class="pause-item" type="button" role="menuitem" data-action="quit" style="--i: 2"><span class="pause-dot"></span>Quit to Menu</button>
            </nav>
            <p class="pause-hint"><span class="key">Esc</span> resume</p>
        </div>
    `;
    document.body.appendChild(overlay);

    const items = Array.from(
        overlay.querySelectorAll<HTMLButtonElement>('.pause-item'),
    );

    let open = false;
    let exitTimer = 0;

    function show(): void {
        if (open) return;
        open = true;
        window.clearTimeout(exitTimer);

        overlay.classList.toggle(REDUCED_MOTION_CLASS, prefersReducedMotion());
        overlay.hidden = false;
        void overlay.offsetWidth;
        overlay.classList.add('is-visible');

        pauseController.setPaused(true);
        setMenuOpen('pause', true);
        items[0]?.focus();
    }

    function hide(): void {
        if (!open) return;
        open = false;
        pauseController.setPaused(false);
        setMenuOpen('pause', false);

        overlay.classList.remove('is-visible');
        if (prefersReducedMotion()) {
            overlay.hidden = true;
        } else {
            exitTimer = window.setTimeout(() => {
                if (!open) overlay.hidden = true;
            }, EXIT_MS);
        }
    }

    function activate(action: string): void {
        switch (action) {
            case 'resume':
                hide();
                break;
            case 'settings':
                // Close the pause overlay first so the (gameplay-tagged)
                // settings panel is no longer suppressed, then reveal it.
                hide();
                actions.openSettings();
                break;
            case 'quit':
                hide();
                actions.quitToMenu();
                break;
        }
    }

    overlay.addEventListener('click', (event) => {
        const button = (event.target as HTMLElement).closest<HTMLElement>('.pause-item');
        if (button?.dataset.action) activate(button.dataset.action);
    });

    overlay.addEventListener('keydown', (event) => {
        if (!open) return;
        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            hide();
            return;
        }
        if (handleArrowNav(items, event)) event.preventDefault();
    });

    const handle: PauseMenuHandle = {
        show,
        hide,
        toggle() {
            if (open) hide();
            else if (actions.canOpen()) show();
        },
        isOpen: () => open,
    };

    // Escape anywhere toggles the pause menu (except while another modal owns it).
    window.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        if (open) return; // handled by the overlay's own listener
        if (!actions.canOpen()) return;
        event.preventDefault();
        show();
    });

    return handle;
}
