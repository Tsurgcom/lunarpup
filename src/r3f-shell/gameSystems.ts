import { setupTuningPanel } from '../ui/tuning.ts';
import { setupCosmeticsUI } from '../ui/cosmetics.ts';
import { setupGamemodeUI } from '../modes/client.ts';
import { setupExtensions } from '../extensions/client.ts';
import { setupMainMenu, setupMenuButton } from '../ui/mainMenu.ts';
import { setupPauseMenu } from '../ui/pauseMenu.ts';
import { createViewController, type ViewController, type ViewId } from '../ui/viewController.ts';
import { hotkeyForKey, isTypingTarget } from '../ui/hotkeys.ts';
import { setMenuOpen } from '../ui/hudVisibility.ts';
import { prefersReducedMotion, REDUCED_MOTION_CLASS } from '../ui/motion.ts';
import { hasSeenMainMenu } from '../ui/menuState.ts';
import { hasSeenControls, markControlsSeen } from '../ui/controlsLegendState.ts';
import { isDevMode } from '../ui/devFlag.ts';

/**
 * Imperative HUD systems and the intent-layer wiring. Runs once after the React
 * shell commits its skeletons. The three strata:
 *  - Ambient HUD (React) is left alone here.
 *  - Intent views (Shop/Rooms/Settings/Controls) are hidden `.lp-view`
 *    overlays; `viewController` reveals one at a time, dimming the world.
 *  - Menus (main/pause) pause solo physics; views never do.
 * A module-level guard keeps this idempotent under React StrictMode's remount.
 */
let mounted = false;

const VIEW_EXIT_MS = 240; // keep in sync with --dur-base

export function mountGameSystems(): void {
    if (mounted) return;
    mounted = true;

    // Content systems mount into the view skeletons committed by the shell.
    setupTuningPanel();
    setupCosmeticsUI();
    setupGamemodeUI();
    void setupExtensions();

    // Raw Live Tuning export is a dev tool; `.lp-dev-only` stays hidden unless on.
    document.body.classList.toggle('lp-dev', isDevMode());

    const viewController = createViewController();
    registerIntentViews(viewController);

    const mainMenu = setupMainMenu({
        openView: (id) => viewController.open(id),
        openModes: () => viewController.open('rooms'),
        onPlay: () => maybeShowControlsLegend(viewController),
    });
    setupPauseMenu({
        openSettings: () => viewController.open('settings'),
        quitToMenu: () => mainMenu.show(),
        // Pause may only open at play — never over a menu or an intent view.
        canOpen: () => !mainMenu.isOpen() && !viewController.isOpen(),
    });
    setupMenuButton(() => mainMenu.show());

    wireHotkeys(viewController, mainMenu.isOpen);
    wireHoldOverlays(viewController, mainMenu.isOpen);

    // Picking a gamemode from the Rooms view drops the player into play.
    document.getElementById('modes-section')?.addEventListener('click', (event) => {
        if ((event.target as HTMLElement).closest('button')) viewController.close();
    });

    if (!hasSeenMainMenu()) {
        mainMenu.show(); // the controls legend follows on first `onPlay`
    } else {
        maybeShowControlsLegend(viewController);
    }
}

/** Build a show/hide binding for each `#<id>-view` overlay and register it. */
function registerIntentViews(controller: ViewController): void {
    const ids: ViewId[] = ['shop', 'rooms', 'settings', 'controls'];
    for (const id of ids) {
        const el = document.getElementById(`${id}-view`);
        if (!el) continue;

        const menuKey = `view:${id}`;
        let open = false;
        let exitTimer = 0;

        const show = () => {
            if (open) return;
            open = true;
            window.clearTimeout(exitTimer);
            el.classList.toggle(REDUCED_MOTION_CLASS, prefersReducedMotion());
            el.hidden = false;
            void el.offsetWidth; // force the reflow so the entrance transition runs
            el.classList.add('is-visible');
            setMenuOpen(menuKey, true);
            el.querySelector<HTMLElement>(
                'button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
            )?.focus();
        };

        const hide = () => {
            if (!open) return;
            open = false;
            setMenuOpen(menuKey, false);
            el.classList.remove('is-visible');
            if (prefersReducedMotion()) {
                el.hidden = true;
            } else {
                exitTimer = window.setTimeout(() => {
                    if (!open) el.hidden = true;
                }, VIEW_EXIT_MS);
            }
            if (id === 'controls') markControlsSeen();
        };

        controller.register(id, { show, hide });

        // Esc / backdrop return to play, closing exactly this layer. Stop the
        // event so the pause menu's window listener never also fires.
        el.addEventListener('keydown', (event) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            event.stopPropagation();
            controller.close();
        });
        el.querySelector('.lp-scrim')?.addEventListener('click', () => controller.close());
        if (id === 'controls') {
            el.querySelector('#controls-dismiss')?.addEventListener('click', () => controller.close());
        }
        if (id === 'settings') {
            el.querySelector('#open-controls')?.addEventListener('click', () => controller.open('controls'));
        }
    }
}

function wireHotkeys(controller: ViewController, isMenuOpen: () => boolean): void {
    window.addEventListener('keydown', (event) => {
        if (event.metaKey || event.ctrlKey || event.altKey) return;
        if (isMenuOpen()) return;
        if (isTypingTarget(event.target)) return;

        const id = hotkeyForKey(event.key);
        if (!id) return;
        event.preventDefault();
        controller.toggle(id);
    });
}

/** Hold Tab for the roster (multiplayer), hold M to enlarge the minimap. */
function wireHoldOverlays(controller: ViewController, isMenuOpen: () => boolean): void {
    const roster = document.getElementById('roster-overlay');
    const minimap = document.getElementById('minimap-panel');
    const blocked = () => isMenuOpen() || controller.isOpen();

    let rosterHeld = false;
    let mapHeld = false;

    window.addEventListener('keydown', (event) => {
        if (event.key === 'Tab' && roster) {
            // While a view/menu owns the screen, leave Tab to normal focus
            // navigation; only hijack it for the roster during play.
            if (blocked() || isTypingTarget(event.target)) return;
            event.preventDefault();
            if (rosterHeld || event.repeat) return;
            rosterHeld = true;
            roster.hidden = false;
            roster.classList.add('is-visible');
            return;
        }
        if ((event.key === 'm' || event.key === 'M') && minimap) {
            if (isTypingTarget(event.target) || blocked() || mapHeld || event.repeat) return;
            mapHeld = true;
            minimap.classList.add('minimap-enlarged');
        }
    });

    window.addEventListener('keyup', (event) => {
        if (event.key === 'Tab' && roster && rosterHeld) {
            rosterHeld = false;
            roster.classList.remove('is-visible');
            roster.hidden = true;
        }
        if ((event.key === 'm' || event.key === 'M') && minimap && mapHeld) {
            mapHeld = false;
            minimap.classList.remove('minimap-enlarged');
        }
    });
}

/** First-time players see the controls legend once; the dismissal persists. */
function maybeShowControlsLegend(controller: ViewController): void {
    if (hasSeenControls()) return;
    controller.open('controls');
}
