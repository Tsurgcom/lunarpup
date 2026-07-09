import * as THREE from 'three';
import { speedLines } from '../state.ts';

const LINE_COUNT = 46;

export function createSpeedLines(layer: HTMLElement): HTMLDivElement[] {
    layer.replaceChildren();

    const lines: HTMLDivElement[] = [];
    for (let i = 0; i < LINE_COUNT; i++) {
        const line = document.createElement('div');
        line.className = 'speed-line';
        const angle = (i / LINE_COUNT) * Math.PI * 2;
        const radius = 10 + Math.random() * 36;
        const length = 8 + Math.random() * 16;
        line.dataset.angle = String(angle);
        line.dataset.radius = String(radius);
        line.dataset.length = String(length);
        layer.appendChild(line);
        lines.push(line);
    }

    return lines;
}

export function bindSpeedLinesLayer(layer: HTMLElement): HTMLDivElement[] {
    return createSpeedLines(layer);
}

export function setupSpeedLines() {
    const layer = document.getElementById('speed-lines');
    if (!layer) return [];
    return createSpeedLines(layer);
}

export function updateSpeedLines(speedRatio: number, isBoosting: boolean) {
    const layer = document.getElementById('speed-lines');
    if (!layer) return;

    const intensity = THREE.MathUtils.clamp((speedRatio - 0.36) / 0.64, 0, 1);
    layer.style.opacity = (isBoosting ? Math.max(0.45, intensity) : intensity * 0.72).toFixed(3);

    const pulse = performance.now() * (isBoosting ? 0.045 : 0.028);
    speedLines.forEach((line, i) => {
        const angle = Number(line.dataset.angle);
        const radius = Number(line.dataset.radius) + ((pulse + i * 6) % 28);
        const length = Number(line.dataset.length) * (isBoosting ? 1.55 : 1.0);
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        line.style.width = `${length}vw`;
        line.style.transform = `translate(${x}vw, ${y}vh) rotate(${angle}rad) translateX(${8 + intensity * 10}vw)`;
    });
}
