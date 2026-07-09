import { useEffect } from 'react';
import { ChatPanel } from './ChatPanel.tsx';
import { GameCanvas } from './GameCanvas.tsx';
import { MinimapPanel } from './MinimapPanel.tsx';
import { MultiplayerPanel } from './MultiplayerPanel.tsx';
import { TrickHud } from './TrickHud.tsx';
import { TuningPanel } from './TuningPanel.tsx';
import { SpeedHud } from './SpeedHud.tsx';
import { SpeedLines } from './SpeedLines.tsx';
import { UpdateNotice } from './UpdateNotice.tsx';
import { mountGameSystems } from './gameSystems.ts';
import { getMultiplayerConfig } from '../net/protocol.ts';
import '../styles.css';
import './shell.css';

export function App() {
    const multiplayer = getMultiplayerConfig();

    // Mount the imperative HUD systems (settings, cosmetics, gamemodes, menus,
    // extensions) after the React skeletons are in the DOM. Guarded internally
    // so StrictMode's dev remount does not double-append.
    useEffect(() => {
        mountGameSystems();
    }, []);

    return (
        <main className="r3f-shell">
            <div id="ui" className="lp-gameplay">
                <h1>🌙 Lunar Pup Skater</h1>
                <div className="controls lp-panel">
                    <span className="key">▲</span> / <span className="key">W</span> Accelerate<br />
                    <span className="key">▼</span> / <span className="key">S</span> Brake / Reverse<br />
                    <span className="key">◀</span> <span className="key">▶</span> / <span className="key">A</span> <span className="key">D</span> Steer<br />
                    <span className="key">Spacebar</span> Low-Gravity Ollie (Jump)<br />
                    <span className="key">Shift</span> Boost<br />
                    <span className="key">Mouse drag</span> Orbit Camera<br />
                    <span className="key">Wheel</span> Zoom In / Out
                </div>
            </div>
            <TuningPanel />
            <TrickHud />
            <MinimapPanel />
            <MultiplayerPanel />
            <ChatPanel multiplayerEnabled={multiplayer.enabled} playerName={multiplayer.name} />
            <SpeedHud />
            <SpeedLines />
            <UpdateNotice />
            <div id="canvas-container"><GameCanvas /></div>
        </main>
    );
}
