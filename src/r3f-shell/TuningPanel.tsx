import { useState } from 'react';
import { tuningSettings, type PhysicsKey } from '../config.ts';
import { physics } from '../state.ts';

type TuningValues = Record<PhysicsKey, number>;

function readTuningValues(): TuningValues {
    return Object.fromEntries(tuningSettings.map(setting => [setting.key, physics[setting.key]])) as TuningValues;
}

function formatTuning(values: TuningValues) {
    const lines = tuningSettings.map(setting => `            ${setting.key}: ${values[setting.key]},`).join('\n');
    return `// Paste these into the physics object:\n${lines}`;
}

export function TuningPanel() {
    const [defaults] = useState<TuningValues>(readTuningValues);
    const [values, setValues] = useState<TuningValues>(readTuningValues);

    function updateSetting(key: PhysicsKey, value: number) {
        physics[key] = value;
        setValues(current => ({ ...current, [key]: value }));
    }

    function resetSettings() {
        for (const setting of tuningSettings) physics[setting.key] = defaults[setting.key];
        setValues(defaults);
    }

    async function copySettings() {
        const text = formatTuning(values);
        try {
            await navigator.clipboard.writeText(text);
        } catch {
            const output = document.createElement('textarea');
            output.value = text;
            document.body.append(output);
            output.select();
            document.execCommand('copy');
            output.remove();
        }
    }

    return (
        <aside id="tuning-panel" aria-label="Live physics tuning">
            <h2>Live Tuning</h2>
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
                <button type="button" onClick={() => void copySettings()}>Copy values</button>
                <button type="button" onClick={resetSettings}>Reset</button>
            </div>
            <textarea readOnly value={formatTuning(values)} aria-label="Physics settings source" />
        </aside>
    );
}
