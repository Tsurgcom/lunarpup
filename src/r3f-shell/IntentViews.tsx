import { useLayoutEffect, useRef, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { TuningPanel } from './TuningPanel.tsx';
import { useExperience } from './ExperienceProvider.tsx';
import { useGame } from './GameProvider.tsx';
import { raceGamemodePackage } from '../../content/gamemodes/index.ts';
import { startGamemode, stopGamemode } from '../modes/client.ts';

const FOCUSABLE = [
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    'a[href]',
    '[tabindex]:not([tabindex="-1"])',
].join(',');

function useDialogFocus(ref: RefObject<HTMLDivElement | null>, focusVersion: unknown = null) {
    useLayoutEffect(() => {
        const dialog = ref.current;
        if (!dialog) return;
        const preferred = dialog.querySelector<HTMLElement>('[data-autofocus]:not([disabled])');
        const first = dialog.querySelector<HTMLElement>(FOCUSABLE);
        (preferred ?? first ?? dialog).focus({ preventScroll: true });
    }, [ref, focusVersion]);
}

function trapDialogFocus(event: KeyboardEvent<HTMLDivElement>, onEscape: () => void) {
    if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onEscape();
        return;
    }

    const dialog = event.currentTarget;
    if (event.key === 'Tab') {
        const focusable = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)]
            .filter(element => element.tabIndex >= 0 && element.getClientRects().length > 0);
        if (focusable.length === 0) {
            event.preventDefault();
            dialog.focus();
            return;
        }
        const first = focusable[0]!;
        const last = focusable.at(-1)!;
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
        return;
    }

    if (!['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft'].includes(event.key)) return;
    const items = [...dialog.querySelectorAll<HTMLElement>('[data-menu-item]')];
    if (items.length === 0) return;
    const current = items.indexOf(document.activeElement as HTMLElement);
    const direction = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : -1;
    const next = current < 0 ? 0 : (current + direction + items.length) % items.length;
    event.preventDefault();
    items[next]?.focus();
}

function MainMenu() {
    const { back, openSettings, play } = useExperience();
    const { gameReady } = useGame();
    const ref = useRef<HTMLDivElement>(null);
    useDialogFocus(ref, gameReady);

    const startCraterCircuit = () => {
        if (!gameReady) return;
        startGamemode(raceGamemodePackage);
        play();
    };

    const startFreeSkate = () => {
        stopGamemode();
        play();
    };

    return (
        <div
            ref={ref}
            id="main-menu"
            className="lp-overlay experience-overlay main-menu is-visible"
            role="dialog"
            aria-modal="true"
            aria-label="Lunar Pup main menu"
            tabIndex={-1}
            onKeyDown={event => trapDialogFocus(event, back)}
        >
            <div className="lp-scrim" aria-hidden="true" />
            <div className="main-menu-content">
                <div className="main-menu-brand">
                    <p className="main-menu-eyebrow">LUNAR PUP</p>
                    <h1 className="main-menu-title">SKATER</h1>
                    <p className="main-menu-tagline">Low-gravity tricks on the far side of the moon.</p>
                </div>
                <nav className="main-menu-nav" aria-label="Main menu">
                    <button
                        id="main-play"
                        className="main-menu-item main-menu-primary"
                        type="button"
                        data-menu-item
                        data-autofocus
                        disabled={!gameReady}
                        onClick={startCraterCircuit}
                    >
                        <span>Play</span>
                        <span className="main-menu-item-note">{gameReady ? 'Crater Circuit' : 'Loading moon…'}</span>
                    </button>
                    <button
                        id="main-free-skate"
                        className="main-menu-item main-menu-mode"
                        type="button"
                        data-menu-item
                        onClick={startFreeSkate}
                    >
                        <span>Free skate</span>
                        <span className="main-menu-item-note">No clock</span>
                    </button>
                    <button
                        id="main-settings"
                        className="main-menu-item main-menu-utility"
                        type="button"
                        data-menu-item
                        onClick={event => openSettings(event.currentTarget)}
                    >
                        <span>Settings</span>
                        <span className="main-menu-item-note">Controls & feel</span>
                    </button>
                </nav>
                <p className="main-menu-hint"><span className="key">Esc</span> play · <span className="key">↑</span> <span className="key">↓</span> move</p>
            </div>
        </div>
    );
}

function PauseMenu() {
    const { back, openSettings, quitToMainMenu } = useExperience();
    const ref = useRef<HTMLDivElement>(null);
    useDialogFocus(ref);

    return (
        <div
            ref={ref}
            id="pause-menu"
            className="lp-overlay experience-overlay pause-menu is-visible"
            role="dialog"
            aria-modal="true"
            aria-label="Paused"
            tabIndex={-1}
            onKeyDown={event => trapDialogFocus(event, back)}
        >
            <button className="lp-scrim experience-backdrop" type="button" tabIndex={-1} aria-label="Resume skating" onClick={back} />
            <div className="pause-orrery" aria-hidden="true">
                <span className="pause-ring pause-ring-1" />
                <span className="pause-ring pause-ring-2" />
                <span className="pause-ring pause-ring-3" />
                <span className="pause-core" />
            </div>
            <div className="pause-content">
                <p className="pause-eyebrow">PAUSED</p>
                <nav className="pause-nav" aria-label="Pause menu">
                    <button id="pause-resume" className="pause-item" type="button" data-menu-item data-autofocus onClick={back}>
                        <span className="pause-dot" aria-hidden="true" />Resume
                    </button>
                    <button id="pause-settings" className="pause-item" type="button" data-menu-item onClick={event => openSettings(event.currentTarget)}>
                        <span className="pause-dot" aria-hidden="true" />Settings
                    </button>
                    <button id="pause-quit" className="pause-item" type="button" data-menu-item onClick={quitToMainMenu}>
                        <span className="pause-dot" aria-hidden="true" />Quit to Menu
                    </button>
                </nav>
                <p className="pause-hint"><span className="key">Esc</span> resume</p>
            </div>
        </div>
    );
}

interface ViewShellProps {
    id: string;
    label: string;
    eyebrow: string;
    title: string;
    backLabel: string;
    children: ReactNode;
}

function ViewShell({ id, label, eyebrow, title, backLabel, children }: ViewShellProps) {
    const { back } = useExperience();
    const ref = useRef<HTMLDivElement>(null);
    useDialogFocus(ref);

    return (
        <div
            ref={ref}
            id={id}
            className="lp-overlay experience-overlay lp-view is-visible"
            role="dialog"
            aria-modal="true"
            aria-label={label}
            tabIndex={-1}
            onKeyDown={event => trapDialogFocus(event, back)}
        >
            <button className="lp-scrim experience-backdrop" type="button" tabIndex={-1} aria-label={backLabel} onClick={back} />
            <div className="lp-view-content">
                <header className="lp-view-head">
                    <button className="lp-button lp-view-back" type="button" data-autofocus onClick={back}>
                        <span aria-hidden="true">←</span> {backLabel}
                    </button>
                    <p className="lp-view-eyebrow">{eyebrow}</p>
                    <h2 className="lp-view-title">{title}</h2>
                </header>
                <div className="lp-view-body">{children}</div>
            </div>
        </div>
    );
}

function SettingsView() {
    const { openControls, state } = useExperience();
    const backLabel = state.returnTarget === 'main-menu'
        ? 'Back to menu'
        : state.returnTarget === 'pause-menu'
            ? 'Back to pause'
            : 'Back to skating';

    return (
        <ViewShell id="settings-view" label="Settings" eyebrow="Tune the ride" title="Settings" backLabel={backLabel}>
            <section className="settings-section" aria-labelledby="controls-setting-title">
                <div>
                    <h3 id="controls-setting-title">Controls</h3>
                    <p>Review every move before you drop in.</p>
                </div>
                <button id="open-controls" className="lp-button" type="button" onClick={event => openControls(event.currentTarget)}>
                    View controls
                </button>
            </section>
            <TuningPanel />
        </ViewShell>
    );
}

function ControlsView() {
    return (
        <ViewShell id="controls-view" label="Controls" eyebrow="How to skate" title="Controls" backLabel="Back to settings">
            <dl className="controls-legend">
                <div><dt><span className="key">▲</span> / <span className="key">W</span></dt><dd>Accelerate</dd></div>
                <div><dt><span className="key">▼</span> / <span className="key">S</span></dt><dd>Brake or reverse</dd></div>
                <div><dt><span className="key">◀</span> <span className="key">▶</span> / <span className="key">A</span> <span className="key">D</span></dt><dd>Steer</dd></div>
                <div><dt><span className="key">Space</span></dt><dd>Low-gravity ollie</dd></div>
                <div><dt><span className="key">Shift</span></dt><dd>Boost</dd></div>
                <div><dt><span className="key">Mouse drag</span></dt><dd>Orbit camera</dd></div>
                <div><dt><span className="key">Wheel</span></dt><dd>Zoom</dd></div>
                <div><dt><span className="key">Hold M</span></dt><dd>Enlarge map</dd></div>
                <div><dt><span className="key">Hold Tab</span></dt><dd>Player roster in private sessions</dd></div>
                <div><dt><span className="key">Esc</span></dt><dd>Pause or go back one layer</dd></div>
            </dl>
        </ViewShell>
    );
}

export function IntentViews() {
    const { state } = useExperience();
    switch (state.surface) {
        case 'main-menu': return <MainMenu />;
        case 'pause-menu': return <PauseMenu />;
        case 'settings': return <SettingsView />;
        case 'controls': return <ControlsView />;
        case 'play': return null;
    }
}
