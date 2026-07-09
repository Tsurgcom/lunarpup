import { tuningSettings } from '../config.ts';
import type { PhysicsKey } from '../config.ts';
import { physics } from '../state.ts';
import { openConfirmRevert, type ConfirmRevertHandle } from './confirmRevert.ts';

const defaultTuning: Partial<Record<PhysicsKey, number>> = {};
// Draft values live in the sliders; physics only changes on Apply, and can be
// rolled back if the confirm modal reverts.
const draft: Partial<Record<PhysicsKey, number>> = {};

let applyButton: HTMLButtonElement | null = null;
let activeConfirm: ConfirmRevertHandle | null = null;

export function setupTuningPanel() {
    const sliders = document.getElementById('sliders');
    const output = document.getElementById('tuning-output') as HTMLTextAreaElement | null;
    if (!sliders || !output) return;

    applyButton = document.getElementById('apply-settings') as HTMLButtonElement | null;

    tuningSettings.forEach(setting => {
        defaultTuning[setting.key] = physics[setting.key];
        draft[setting.key] = physics[setting.key];

        const row = document.createElement('div');
        row.className = 'slider-row';

        const label = document.createElement('label');
        label.textContent = setting.label;

        const input = document.createElement('input');
        input.type = 'range';
        input.min = String(setting.min);
        input.max = String(setting.max);
        input.step = String(setting.step);
        input.value = String(physics[setting.key]);

        const value = document.createElement('span');
        value.className = 'slider-value';
        value.textContent = Number(input.value).toFixed(3);

        input.addEventListener('input', () => {
            const next = Number(input.value);
            draft[setting.key] = next;
            value.textContent = next.toFixed(3);
            value.classList.toggle('slider-dirty', next !== physics[setting.key]);
            updateTuningOutput(output);
            refreshApplyState();
        });

        row.append(label, input, value);
        sliders.appendChild(row);
    });

    document.getElementById('copy-settings')?.addEventListener('click', async () => {
        updateTuningOutput(output);
        output.select();
        try {
            await navigator.clipboard.writeText(output.value);
        } catch {
            document.execCommand('copy');
        }
    });

    document.getElementById('reset-settings')?.addEventListener('click', () => {
        tuningSettings.forEach(setting => {
            const restored = defaultTuning[setting.key];
            if (restored !== undefined) {
                physics[setting.key] = restored;
                draft[setting.key] = restored;
            }
        });
        syncSliders(sliders);
        updateTuningOutput(output);
        refreshApplyState();
    });

    applyButton?.addEventListener('click', () => applyDraft(sliders, output));

    updateTuningOutput(output);
    refreshApplyState();
}

function applyDraft(sliders: HTMLElement, output: HTMLTextAreaElement) {
    // Snapshot the current live physics so the modal can roll back to it.
    const previous: Partial<Record<PhysicsKey, number>> = {};
    tuningSettings.forEach(setting => {
        previous[setting.key] = physics[setting.key];
        const next = draft[setting.key];
        if (next !== undefined) physics[setting.key] = next;
    });

    if (applyButton) applyButton.disabled = true;
    activeConfirm?.dispose();
    activeConfirm = openConfirmRevert({
        onResolve(outcome) {
            activeConfirm = null;
            if (outcome === 'reverted') {
                tuningSettings.forEach(setting => {
                    const restored = previous[setting.key];
                    if (restored !== undefined) {
                        physics[setting.key] = restored;
                        draft[setting.key] = restored;
                    }
                });
                syncSliders(sliders);
                updateTuningOutput(output);
            }
            refreshApplyState();
        },
    });
}

function syncSliders(sliders: HTMLElement) {
    tuningSettings.forEach((setting, i) => {
        const row = sliders.children[i] as HTMLElement | undefined;
        if (!row) return;
        const input = row.querySelector('input') as HTMLInputElement | null;
        const value = row.querySelector('.slider-value') as HTMLElement | null;
        if (input) input.value = String(physics[setting.key]);
        if (value) {
            value.textContent = Number(physics[setting.key]).toFixed(3);
            value.classList.remove('slider-dirty');
        }
    });
}

function refreshApplyState() {
    if (!applyButton) return;
    const dirty = tuningSettings.some(setting => draft[setting.key] !== physics[setting.key]);
    applyButton.disabled = !dirty;
}

function updateTuningOutput(output: HTMLTextAreaElement) {
    const values = tuningSettings.map(setting => `            ${setting.key}: ${draft[setting.key]},`).join('\n');
    output.value = `// Paste these into the physics object:\n${values}`;
}
