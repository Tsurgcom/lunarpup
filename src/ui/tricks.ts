import type { TrickScore } from '../game/trickScoring.ts';

let scoreEl: HTMLDivElement | null = null;
let currentEl: HTMLDivElement | null = null;
let resultEl: HTMLDivElement | null = null;
let resultTimer: ReturnType<typeof setTimeout> | null = null;

interface TrickHudBinding {
    updateScore: (totalScore: number) => void;
    updateCurrent: (rotation: number, grabbing: boolean) => void;
    showResult: (result: TrickScore) => void;
}

let reactHud: TrickHudBinding | null = null;

export function bindTrickHud(binding: TrickHudBinding) {
    reactHud = binding;

    return () => {
        if (reactHud === binding) reactHud = null;
    };
}

export function setupTrickUI() {
    document.getElementById('trick-hud')?.remove();
    const panel = document.createElement('div');
    panel.id = 'trick-hud';
    panel.innerHTML = `
        <div id="trick-score">SCORE 0</div>
        <div id="trick-current"></div>
        <div id="trick-result"></div>
    `;
    document.body.appendChild(panel);

    scoreEl = panel.querySelector('#trick-score');
    currentEl = panel.querySelector('#trick-current');
    resultEl = panel.querySelector('#trick-result');
}

export function updateTrickScore(totalScore: number) {
    if (reactHud) {
        reactHud.updateScore(totalScore);
        return;
    }
    if (scoreEl) scoreEl.textContent = `SCORE ${totalScore.toLocaleString()}`;
}

export function updateCurrentTrick(rotation: number, grabbing: boolean) {
    if (reactHud) {
        reactHud.updateCurrent(rotation, grabbing);
        return;
    }
    if (!currentEl) return;

    const degrees = Math.round(Math.abs(rotation) * 180 / Math.PI);
    const labels = [degrees >= 10 ? `SPIN ${degrees}°` : '', grabbing ? 'MOON GRAB' : '']
        .filter(Boolean);
    currentEl.textContent = labels.join(' · ');
    currentEl.classList.toggle('visible', labels.length > 0);
}

export function showTrickResult(result: TrickScore) {
    if (reactHud) {
        reactHud.showResult(result);
        return;
    }
    if (!resultEl || result.status === 'none') return;

    if (resultTimer) clearTimeout(resultTimer);
    resultEl.textContent = result.status === 'scored'
        ? `${result.name}  +${result.points}`
        : result.name;
    resultEl.className = result.status === 'scored' ? 'landed' : 'sketchy';
    void resultEl.offsetWidth;
    resultEl.classList.add('visible');

    resultTimer = setTimeout(() => {
        resultEl?.classList.remove('visible');
    }, 1400);
}
