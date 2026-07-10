import { useEffect } from 'react';
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
import { mountGameSystems } from './gameSystems.ts';
import { getMultiplayerConfig } from '../net/protocol.ts';
import '../styles.css';
import './shell.css';

/**
 * The screen belongs to the gameplay. During play only the ambient HUD shows:
 * speed, score, and the small minimap — plus a presence chip and a chrome-free
 * chat line in multiplayer. Shop / Rooms / Settings / Controls are focused
 * overlay views summoned one at a time (menu, ☰ button, or C/R/T/? hotkeys),
 * mounted imperatively in `mountGameSystems`.
 */
export function App() {
    const multiplayer = getMultiplayerConfig();

    useEffect(() => {
        mountGameSystems();
    }, []);

    return (
        <main className="r3f-shell">
            {/* Ambient HUD — always on during play, glanceable, never interactive. */}
            <SpeedHud />
            <TrickHud />
            <MinimapPanel />
            {multiplayer.enabled && <PresenceChip />}

            {/* Transient + intent layers. */}
            <SpeedLines />
            <UpdateNotice />
            <ChatPanel multiplayerEnabled={multiplayer.enabled} playerName={multiplayer.name} />
            {multiplayer.enabled && <RosterOverlay />}
            <IntentViews />

            <div id="canvas-container"><GameCanvas /></div>
        </main>
    );
}
