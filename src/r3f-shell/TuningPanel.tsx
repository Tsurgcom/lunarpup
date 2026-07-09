/**
 * Skeleton for the live-tuning panel. The behaviour — sliders, draft state,
 * Apply with confirm/auto-revert, Copy, Reset — lives in `../ui/tuning.ts`
 * (`setupTuningPanel`), bound once from `mountGameSystems` after this DOM is
 * committed. Rendering only the skeleton keeps the imperative trust flow intact
 * while mounting through the React shell.
 */
export function TuningPanel() {
    return (
        <aside id="tuning-panel" className="lp-panel lp-gameplay" aria-label="Live physics tuning">
            <h2 className="lp-panel-title">Settings</h2>
            <div id="sliders" />
            <div className="tuning-buttons">
                <button id="apply-settings" className="lp-button lp-button-primary" type="button" disabled>Apply</button>
                <button id="copy-settings" className="lp-button" type="button">Copy</button>
                <button id="reset-settings" className="lp-button" type="button">Reset</button>
            </div>
            <textarea id="tuning-output" readOnly placeholder="Tune sliders, then copy these values back to hardcode." />
        </aside>
    );
}
