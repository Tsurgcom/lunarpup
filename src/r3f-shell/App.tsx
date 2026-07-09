import { GameProvider, useGame } from './GameProvider.tsx';
import { ChatPanel } from './ChatPanel.tsx';
import { GameCanvas } from './GameCanvas.tsx';
import { MinimapPanel } from './MinimapPanel.tsx';
import { MultiplayerPanel } from './MultiplayerPanel.tsx';
import { TrickHud } from './TrickHud.tsx';
import { TuningPanel } from './TuningPanel.tsx';
import { SpeedHud } from './SpeedHud.tsx';
import { SpeedLines } from './SpeedLines.tsx';
import { UpdateNotice } from './UpdateNotice.tsx';
import '../styles.css';
import './shell.css';

function ChatPanelWrapper() {
    const { multiplayerConfig } = useGame();
    return (
        <ChatPanel
            multiplayerEnabled={multiplayerConfig.enabled}
        />
    );
}

export function App() {
    return (
        <GameProvider>
            <main className="r3f-shell">
                <div id="ui">
                    <h1>🌙 Lunar Pup Skater</h1>
                    <div className="controls">
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
                <ChatPanelWrapper />
                <SpeedHud />
                <SpeedLines />
                <UpdateNotice />
                <div id="canvas-container"><GameCanvas /></div>
            </main>
        </GameProvider>
    );
}
