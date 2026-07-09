import { tuningSettings } from '../config.ts';
import type { PhysicsKey } from '../config.ts';
import { physics } from '../state.ts';

const defaultTuning: Partial<Record<PhysicsKey, number>> = {};

export function setupTuningPanel() {
    const sliders = document.getElementById('sliders');
    const output = document.getElementById('tuning-output') as HTMLTextAreaElement | null;
    if (!sliders || !output) return;

    tuningSettings.forEach(setting => {
        defaultTuning[setting.key] = physics[setting.key];

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
            physics[setting.key] = Number(input.value);
            value.textContent = Number(input.value).toFixed(3);
            updateTuningOutput(output);
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
        tuningSettings.forEach((setting, i) => {
            const restored = defaultTuning[setting.key];
            if (restored !== undefined) physics[setting.key] = restored;
            const row = sliders.children[i] as HTMLElement;
            const input = row.querySelector('input') as HTMLInputElement;
            const value = row.querySelector('.slider-value') as HTMLElement;
            input.value = String(physics[setting.key]);
            value.textContent = Number(input.value).toFixed(3);
        });
        updateTuningOutput(output);
    });

    updateTuningOutput(output);
}

function updateTuningOutput(output: HTMLTextAreaElement) {
    const values = tuningSettings.map(setting => `            ${setting.key}: ${physics[setting.key]},`).join('\n');
    output.value = `// Paste these into the physics object:\n${values}`;
}
