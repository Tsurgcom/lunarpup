import { GameCanvas } from './GameCanvas.tsx';
import '../styles.css';
import './shell.css';

export function App() {
    return (
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
            <div id="tuning-panel">
                <h2>⚙️ Live Tuning</h2>
                <div id="sliders" />
                <div className="tuning-buttons"><button id="copy-settings" type="button">Copy values</button><button id="reset-settings" type="button">Reset</button></div>
                <textarea id="tuning-output" readOnly placeholder="Tune sliders, then copy these values back to hardcode." />
            </div>
            <div id="speedometer">0.0 U/S  | chunks 0</div>
            <div id="speed-lines" />
            <div id="canvas-container"><GameCanvas /></div>
        </main>
    );
}
