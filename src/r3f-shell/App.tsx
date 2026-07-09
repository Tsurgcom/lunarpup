import { GameCanvas } from './GameCanvas.tsx';
import '../styles.css';
import './shell.css';

export function App() {
    return (
        <main className="r3f-shell">
            <div id="ui"><h1>🌙 Lunar Pup Skater</h1><div className="controls">R3F renderer adapter</div></div>
            <div id="tuning-panel"><h2>⚙️ Live Tuning</h2><div id="sliders" /><div className="tuning-buttons"><button id="copy-settings" type="button">Copy values</button><button id="reset-settings" type="button">Reset</button></div><textarea id="tuning-output" readOnly /></div>
            <div id="speedometer">0.0 U/S | chunks 0</div><div id="speed-lines" />
            <div id="canvas-container"><GameCanvas /></div>
        </main>
    );
}
