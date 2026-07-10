/**
 * Skeleton for the tuning sliders inside the Settings view. Behaviour — draft
 * state, Apply with confirm/auto-revert, Copy, Reset — lives in
 * `../ui/tuning.ts` (`setupTuningPanel`), bound once from `mountGameSystems`.
 *
 * The sliders and the Apply/Reset row are player-facing. The raw Live Tuning
 * output (Copy + the hardcode-values textarea) is a developer tool gated behind
 * `?dev=1`: it lives inside `.lp-dev-only`, hidden unless `mountGameSystems`
 * puts the body into dev mode.
 */
export function TuningPanel() {
    return (
        <section id="tuning-panel" className="lp-view-section" aria-label="Physics tuning">
            <div id="sliders" />
            <div className="tuning-buttons">
                <button id="apply-settings" className="lp-button lp-button-primary" type="button" disabled>Apply</button>
                <button id="reset-settings" className="lp-button" type="button">Reset</button>
            </div>
            <div className="lp-dev-only" aria-label="Developer tuning export">
                <p className="lp-dev-label">Live tuning (dev) — copy to hardcode</p>
                <div className="tuning-buttons">
                    <button id="copy-settings" className="lp-button" type="button">Copy</button>
                </div>
                <textarea id="tuning-output" readOnly placeholder="Tune sliders, then copy these values back to hardcode." />
            </div>
        </section>
    );
}
