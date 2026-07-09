import { markMainMenuSeen } from './menuState.ts';
import { prefersReducedMotion, REDUCED_MOTION_CLASS } from './motion.ts';
import { handleArrowNav } from './menuNav.ts';
import { pauseController } from '../game/pause.ts';
import { setMenuOrbit } from '../game/loop.ts';
import { setMenuOpen } from './hudVisibility.ts';

export interface MainMenuActions {
    /** Reveal the multiplayer/rooms panel. */
    openRooms(): void;
    /** Reveal the cosmetics shop panel. */
    openCosmetics(): void;
    /** Reveal the settings/tuning panel. */
    openSettings(): void;
}

export interface MainMenuHandle {
    show(): void;
    hide(): void;
    isOpen(): boolean;
}

const EXIT_MS = 420; // keep in sync with --dur-slow

export function setupMainMenu(actions: MainMenuActions): MainMenuHandle {
    const overlay = document.createElement('div');
    overlay.id = 'main-menu';
    overlay.className = 'lp-overlay main-menu';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Lunar Pup main menu');
    overlay.hidden = true;
    overlay.innerHTML = `
        <div class="lp-scrim"></div>
        <div class="main-menu-content">
            <div class="main-menu-brand" style="--i: 0">
                <p class="main-menu-eyebrow">LUNAR PUP</p>
                <h1 class="main-menu-title">SKATER</h1>
                <p class="main-menu-tagline">Low-gravity tricks on the far side of the moon.</p>
            </div>
            <nav class="main-menu-nav" role="menu" aria-label="Main menu">
                <button class="main-menu-item" type="button" role="menuitem" data-action="play" style="--i: 1">Play</button>
                <button class="main-menu-item" type="button" role="menuitem" data-action="rooms" style="--i: 2">Rooms</button>
                <button class="main-menu-item" type="button" role="menuitem" data-action="cosmetics" style="--i: 3">Cosmetics</button>
                <button class="main-menu-item" type="button" role="menuitem" data-action="settings" style="--i: 4">Settings</button>
            </nav>
            <p class="main-menu-hint" style="--i: 5"><span class="key">↑</span> <span class="key">↓</span> move · <span class="key">Enter</span> select · <span class="key">Esc</span> play</p>
        </div>
    `;
    document.body.appendChild(overlay);

    const items = Array.from(
        overlay.querySelectorAll<HTMLButtonElement>('.main-menu-item'),
    );

    let open = false;
    let exitTimer = 0;

    function show(): void {
        if (open) return;
        open = true;
        window.clearTimeout(exitTimer);

        const isReduced = prefersReducedMotion();
        overlay.classList.toggle(REDUCED_MOTION_CLASS, isReduced);
        overlay.hidden = false;
        // Force reflow so the transition from the hidden state actually runs.
        void overlay.offsetWidth;
        overlay.classList.add('is-visible');

        pauseController.setPaused(true);
        setMenuOpen('main', true);
        setMenuOrbit(true, isReduced);
        items[0]?.focus();
    }

    function hide(): void {
        if (!open) return;
        open = false;
        markMainMenuSeen();
        setMenuOrbit(false);
        pauseController.setPaused(false);
        setMenuOpen('main', false);

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
            case 'play':
                hide();
                break;
            case 'rooms':
                hide();
                actions.openRooms();
                break;
            case 'cosmetics':
                hide();
                actions.openCosmetics();
                break;
            case 'settings':
                hide();
                actions.openSettings();
                break;
        }
    }

    overlay.addEventListener('click', (event) => {
        const button = (event.target as HTMLElement).closest<HTMLElement>('.main-menu-item');
        if (button?.dataset.action) activate(button.dataset.action);
    });

    overlay.addEventListener('keydown', (event) => {
        if (!open) return;
        if (event.key === 'Escape') {
            event.preventDefault();
            hide();
            return;
        }
        if (handleArrowNav(items, event)) event.preventDefault();
    });

    return {
        show,
        hide,
        isOpen: () => open,
    };
}


/** Small persistent button that reopens the main menu for returning players. */
export function setupMenuButton(onOpen: () => void): void {
    const button = document.createElement('button');
    button.id = 'menu-button';
    button.type = 'button';
    button.setAttribute('aria-label', 'Open menu');
    button.title = 'Menu';
    button.textContent = '☰';
    button.addEventListener('click', onOpen);
    document.body.appendChild(button);
}

