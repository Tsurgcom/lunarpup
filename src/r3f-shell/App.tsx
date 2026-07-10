import { useEffect } from 'react';
import { GameProvider, useGame } from './GameProvider.tsx';
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
import '../styles.css';
import './shell.css';

function ExperienceShell() {
    const { multiplayerConfig } = useGame();

    useEffect(() => {
        mountGameSystems();
    }, []);

    const multiplayerEnabled = multiplayerConfig?.enabled ?? false;

    return (
        <main className="r3f-shell">
            <SpeedHud />
            <TrickHud />
            <MinimapPanel />
            {multiplayerEnabled && <PresenceChip />}

            <SpeedLines />
            <UpdateNotice />
            <ChatPanel multiplayerEnabled={multiplayerEnabled} />
            {multiplayerEnabled && <RosterOverlay />}
            <IntentViews />

            <div id="canvas-container"><GameCanvas /></div>
        </main>
    );
}

export function App() {
    return (
        <GameProvider>
            <ExperienceShell />
        </GameProvider>
    );
}
