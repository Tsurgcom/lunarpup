import { useEffect, useRef, useState, type RefObject } from 'react';
import { setupExtensions } from '../extensions/client.ts';
import { isDevMode } from '../ui/devFlag.ts';
import { disposeGamemodeUI } from '../modes/client.ts';
import { GameProvider, useGame } from './GameProvider.tsx';
import { ExperienceProvider, useExperience } from './ExperienceProvider.tsx';
import { ChatPanel } from './ChatPanel.tsx';
import { GameCanvas } from './GameCanvas.tsx';
import { MinimapPanel } from './MinimapPanel.tsx';
import { IntentViews } from './IntentViews.tsx';
import { PresenceChip } from './PresenceChip.tsx';
import { RosterOverlay } from './RosterOverlay.tsx';
import { TrickHud } from './TrickHud.tsx';
import { SpeedHud } from './SpeedHud.tsx';
import { SpeedLines } from './SpeedLines.tsx';
import { UpdateNotice } from './UpdateNotice.tsx';
import { ToastHost } from './ToastHost.tsx';
import { GamemodeHud, GamemodeResults, useGamemodePresentation } from './GamemodeOverlay.tsx';
import '../styles.css';
import './shell.css';
import './run.css';

function isTypingTarget(target: EventTarget | null): boolean {
    const element = target as HTMLElement | null;
    if (!element) return false;
    return element.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName);
}

function ExtensionLoader({ hudRoot, transientRoot }: {
    hudRoot: RefObject<HTMLDivElement | null>;
    transientRoot: RefObject<HTMLDivElement | null>;
}) {
    useEffect(() => {
        if (!hudRoot.current || !transientRoot.current) return;
        const controller = new AbortController();
        let cleanup: (() => void) | null = null;
        void setupExtensions({
            hudRoot: hudRoot.current,
            transientRoot: transientRoot.current,
            signal: controller.signal,
        }).then(dispose => {
            if (controller.signal.aborted) dispose();
            else cleanup = dispose;
        }).catch(error => {
            if (!controller.signal.aborted) console.warn('[extensions] listing unavailable; core game remains ready', error);
        });
        return () => {
            controller.abort();
            cleanup?.();
        };
    }, [hudRoot, transientRoot]);
    return null;
}

function ExperienceShell() {
    const { multiplayerConfig } = useGame();
    const { state, covered, simulationPaused, openMainMenu, openPauseMenu } = useExperience();
    const gamemode = useGamemodePresentation();
    const [mapExpanded, setMapExpanded] = useState(false);
    const [rosterVisible, setRosterVisible] = useState(false);
    const extensionHudRoot = useRef<HTMLDivElement>(null);
    const extensionTransientRoot = useRef<HTMLDivElement>(null);
    const multiplayerEnabled = multiplayerConfig?.enabled ?? false;
    const interfaceCovered = covered || gamemode.result !== null;

    useEffect(() => {
        document.body.classList.toggle('lp-dev', isDevMode());
        return () => document.body.classList.remove('lp-dev');
    }, []);

    useEffect(() => () => disposeGamemodeUI(), []);

    useEffect(() => {
        if (state.surface !== 'play') {
            setMapExpanded(false);
            setRosterVisible(false);
            return;
        }

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target)) return;
            if (event.key === 'Escape') {
                event.preventDefault();
                openPauseMenu(document.activeElement as HTMLElement | null);
                return;
            }
            if ((event.key === 'm' || event.key === 'M') && !event.repeat) {
                setMapExpanded(true);
                return;
            }
            if (event.key === 'Tab' && multiplayerEnabled && !event.repeat) {
                event.preventDefault();
                setRosterVisible(true);
            }
        };
        const onKeyUp = (event: KeyboardEvent) => {
            if (event.key === 'm' || event.key === 'M') setMapExpanded(false);
            if (event.key === 'Tab') setRosterVisible(false);
        };
        const onBlur = () => {
            setMapExpanded(false);
            setRosterVisible(false);
        };

        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);
        window.addEventListener('blur', onBlur);
        return () => {
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('keyup', onKeyUp);
            window.removeEventListener('blur', onBlur);
        };
    }, [multiplayerEnabled, openPauseMenu, state.surface]);

    return (
        <main
            className="r3f-shell"
            data-experience-surface={state.surface}
            data-presentation={state.presentation}
            data-simulation-paused={simulationPaused || gamemode.result !== null}
        >
            <div
                id="canvas-container"
                className="experience-layer experience-canvas"
                data-experience-layer="canvas"
                inert={interfaceCovered}
                aria-hidden={interfaceCovered}
            >
                <GameCanvas />
            </div>

            <div
                className="experience-layer experience-hud lp-gameplay"
                data-experience-layer="hud"
                inert={interfaceCovered}
                aria-hidden={interfaceCovered}
            >
                <SpeedHud />
                <TrickHud />
                <GamemodeHud />
                <MinimapPanel expanded={mapExpanded} />
                {multiplayerEnabled && <PresenceChip />}
                <div ref={extensionHudRoot} id="extension-hud-root" className="extension-hud-root" />
            </div>

            <div
                className="experience-layer experience-transient lp-gameplay"
                data-experience-layer="transient"
                inert={interfaceCovered}
                aria-hidden={interfaceCovered}
            >
                <SpeedLines />
                <ToastHost />
                <UpdateNotice />
                <ChatPanel multiplayerEnabled={multiplayerEnabled} interactionEnabled={!interfaceCovered} />
                {multiplayerEnabled && <RosterOverlay visible={rosterVisible} />}
                <div ref={extensionTransientRoot} id="extension-transient-root" className="extension-transient-root" />
                {state.surface === 'play' && !gamemode.result && (
                    <button
                        id="menu-button"
                        type="button"
                        aria-label="Open menu"
                        title="Menu"
                        onClick={event => openMainMenu(event.currentTarget)}
                    >
                        <span aria-hidden="true">☰</span>
                    </button>
                )}
            </div>

            <div className="experience-layer experience-menu" data-experience-layer="menu">
                <IntentViews />
                {gamemode.result && <GamemodeResults result={gamemode.result} />}
            </div>
            <ExtensionLoader hudRoot={extensionHudRoot} transientRoot={extensionTransientRoot} />
        </main>
    );
}

export function App() {
    return (
        <GameProvider>
            <ExperienceProvider>
                <ExperienceShell />
            </ExperienceProvider>
        </GameProvider>
    );
}
