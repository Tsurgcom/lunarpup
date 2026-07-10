import { useState } from 'react';
import { physicsTuningDefaults, tuningSettings, type PhysicsKey } from '../config.ts';
import { useGameRuntime } from './GameProvider.tsx';

type TuningValues = Record<PhysicsKey, number>;

function formatTuning(values: TuningValues) {
    const lines = tuningSettings.map(setting => `            ${setting.key}: ${values[setting.key]},`).join('\n');
    return `// Paste these into the physics object:\n${lines}`;
}

function readTuningValues(physics: ReturnType<typeof useGameRuntime>['physics']): TuningValues {
    return Object.fromEntries(tuningSettings.map(setting => [setting.key, physics[setting.key]])) as TuningValues;
}

export function TuningPanel() {
    const physics = useGameRuntime().physics;
    const [values, setValues] = useState<TuningValues>(() => readTuningValues(physics));
    const [copyStatus, setCopyStatus] = useState('');

    function updateSetting(key: PhysicsKey, value: number) {
        physics[key] = value;
        setValues(current => ({ ...current, [key]: value }));
    }

    function resetSettings() {
        for (const setting of tuningSettings) physics[setting.key] = physicsTuningDefaults[setting.key];
        setValues({ ...physicsTuningDefaults });
    }

    async function copySettings() {
        const text = formatTuning(values);
        try {
            await navigator.clipboard.writeText(text);
            setCopyStatus('Values copied.');
        } catch {
            try {
                const output = document.createElement('textarea');
                output.value = text;
                document.body.append(output);
                output.select();
                const copied = document.execCommand('copy');
                output.remove();
                setCopyStatus(copied ? 'Values copied.' : 'Copy failed. Select the values below and copy them.');
            } catch {
                setCopyStatus('Copy failed. Select the values below and copy them.');
            }
        }
    }

    return (
        <section id="tuning-panel" aria-labelledby="ride-feel-title">
            <header className="settings-section-heading">
                <div>
                    <h3 id="ride-feel-title">Ride feel</h3>
                    <p>Fine-tune movement without leaving the moon.</p>
                </div>
            </header>
            <div id="sliders">
                {tuningSettings.map(setting => (
                    <div className="slider-row" key={setting.key}>
                        <label htmlFor={`tuning-${setting.key}`}>{setting.label}</label>
                        <input
                            id={`tuning-${setting.key}`}
                            type="range"
                            min={setting.min}
                            max={setting.max}
                            step={setting.step}
                            value={values[setting.key]}
                            onChange={event => updateSetting(setting.key, Number(event.target.value))}
                        />
                        <output className="slider-value" htmlFor={`tuning-${setting.key}`}>
                            {values[setting.key].toFixed(3)}
                        </output>
                    </div>
                ))}
            </div>
            <div className="tuning-buttons">
                <button className="lp-button" type="button" onClick={() => void copySettings()}>Copy values</button>
                <button className="lp-button" type="button" onClick={resetSettings}>Reset</button>
            </div>
            {copyStatus && <p className="settings-status" role="status">{copyStatus}</p>}
            <textarea className="lp-field lp-dev-only" readOnly value={formatTuning(values)} aria-label="Physics settings source" />
        </section>
    );
}
