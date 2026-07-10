import { useEffect, useRef, useState } from 'react';
import { setupExtensions } from '../extensions/client.ts';
import { isDevMode } from '../ui/devFlag.ts';
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
import '../styles.css';
import './shell.css';

function isTypingTarget(target: EventTarget | null): boolean {
    const element = target as HTMLElement | null;
    if (!element) return false;
    return element.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName);
}

function ExtensionLoader() {
    const started = useRef(false);
    useEffect(() => {
        if (started.current) return;
        started.current = true;
        void setupExtensions().catch(error => {
            console.warn('[extensions] listing unavailable; core game remains ready', error);
        });
    }, []);
    return null;
}

function ExperienceShell() {
    const { multiplayerConfig } = useGame();
    const { state, covered, openMainMenu, openPauseMenu } = useExperience();
    const [mapExpanded, setMapExpanded] = useState(false);
    const [rosterVisible, setRosterVisible] = useState(false);
    const multiplayerEnabled = multiplayerConfig?.enabled ?? false;

    useEffect(() => {
        document.body.classList.toggle('lp-dev', isDevMode());
        return () => document.body.classList.remove('lp-dev');
    }, []);

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
        <main className="r3f-shell" data-experience-surface={state.surface} data-presentation={state.presentation}>
            <div
                id="canvas-container"
                className="experience-layer experience-canvas"
                data-experience-layer="canvas"
                inert={covered}
                aria-hidden={covered}
            >
                <GameCanvas />
            </div>

            <div
                className="experience-layer experience-hud lp-gameplay"
                data-experience-layer="hud"
                inert={covered}
                aria-hidden={covered}
            >
                <SpeedHud />
                <TrickHud />
                <MinimapPanel expanded={mapExpanded} />
                {multiplayerEnabled && <PresenceChip />}
            </div>

            <div
                className="experience-layer experience-transient lp-gameplay"
                data-experience-layer="transient"
                inert={covered}
                aria-hidden={covered}
            >
                <SpeedLines />
                <UpdateNotice />
                <ChatPanel multiplayerEnabled={multiplayerEnabled} interactionEnabled={!covered} />
                {multiplayerEnabled && <RosterOverlay visible={rosterVisible} />}
                {state.surface === 'play' && (
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
            </div>
            <ExtensionLoader />
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
