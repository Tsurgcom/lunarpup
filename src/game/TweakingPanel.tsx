import { useState } from "react";
import { writeText } from "../platform/clipboard";
import {
  formatPhysicsSnippet,
  isTweakingEnabled,
  type PhysicsKey,
  type PhysicsValues,
  readPhysicsValues,
  resetPhysics,
  setPhysicsValue,
  tuningSettings,
} from "./physicsTuning";

export function TweakingPanel() {
  const enabled = isTweakingEnabled();
  const [values, setValues] = useState<PhysicsValues>(() =>
    readPhysicsValues(),
  );

  if (!enabled) return null;

  function updateSetting(key: PhysicsKey, value: number) {
    setPhysicsValue(key, value);
    setValues((current) => ({ ...current, [key]: value }));
  }

  function onReset() {
    resetPhysics();
    setValues(readPhysicsValues());
  }

  async function copySettings() {
    const text = formatPhysicsSnippet(values);
    try {
      await writeText(text);
    } catch {
      /* clipboard may be denied */
    }
  }

  return (
    <aside className="hud-tweaking" aria-label="Live physics tuning">
      <div className="hud-tweaking__title">
        Live tuning <small>?tweaking</small>
      </div>
      <div className="hud-tweaking__sliders">
        {tuningSettings.map((setting) => (
          <div className="hud-tweaking__row" key={setting.key}>
            <label htmlFor={`tweak-${setting.key}`}>{setting.label}</label>
            <input
              id={`tweak-${setting.key}`}
              type="range"
              min={setting.min}
              max={setting.max}
              step={setting.step}
              value={values[setting.key]}
              onChange={(event) =>
                updateSetting(setting.key, Number(event.target.value))
              }
            />
            <output htmlFor={`tweak-${setting.key}`}>
              {values[setting.key].toFixed(3)}
            </output>
          </div>
        ))}
      </div>
      <div className="hud-tweaking__actions">
        <button type="button" onClick={() => void copySettings()}>
          Copy values
        </button>
        <button type="button" onClick={onReset}>
          Reset
        </button>
      </div>
      <textarea
        className="hud-tweaking__out"
        readOnly
        value={formatPhysicsSnippet(values)}
        aria-label="Physics settings source"
      />
    </aside>
  );
}
