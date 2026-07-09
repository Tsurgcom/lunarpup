import { setupTuningPanel } from '../ui/tuning.ts';
import { setupCosmeticsUI } from '../ui/cosmetics.ts';
import { setupGamemodeUI } from '../modes/client.ts';
import { setupExtensions } from '../extensions/client.ts';
import { setupMainMenu, setupMenuButton } from '../ui/mainMenu.ts';
import { setupPauseMenu } from '../ui/pauseMenu.ts';
import { revealPanel } from '../ui/menuNav.ts';
import { hasSeenMainMenu } from '../ui/menuState.ts';

/**
 * Imperative HUD systems that append their own reskinned DOM (settings/tuning,
 * cosmetics shop, gamemode select, menus, runtime extensions). They are
 * app-lifetime singletons: the R3F shell mounts once, so a module-level guard
 * keeps this idempotent under React StrictMode's dev remount without needing
 * per-system teardown. The tuning panel binds onto the React `TuningPanel`
 * skeleton (`#sliders`, `#tuning-output`, `#apply-settings`, …), which is
 * committed to the DOM before this App effect runs.
 */
let mounted = false;

export function mountGameSystems(): void {
    if (mounted) return;
    mounted = true;

    setupTuningPanel();
    setupCosmeticsUI();
    setupGamemodeUI();
    void setupExtensions();

    const mainMenu = setupMainMenu({
        openRooms: () => revealPanel('multiplayer-panel'),
        openCosmetics: () => revealPanel('cosmetics-panel'),
        openSettings: () => revealPanel('tuning-panel'),
    });
    setupPauseMenu({
        openSettings: () => revealPanel('tuning-panel'),
        quitToMenu: () => mainMenu.show(),
        canOpen: () => !mainMenu.isOpen(),
    });
    setupMenuButton(() => mainMenu.show());

    if (!hasSeenMainMenu()) mainMenu.show();
}
