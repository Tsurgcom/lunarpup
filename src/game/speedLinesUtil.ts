import * as THREE from "three";

const LINE_COUNT = 46;

export function createSpeedLines(layer: HTMLElement): HTMLDivElement[] {
  layer.replaceChildren();

  const lines: HTMLDivElement[] = [];
  for (let i = 0; i < LINE_COUNT; i++) {
    const line = document.createElement("div");
    line.className = "speed-line";
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

export function updateSpeedLines(
  lines: HTMLDivElement[],
  layer: HTMLElement,
  speedRatio: number,
  isBoosting: boolean,
) {
  const intensity = THREE.MathUtils.clamp((speedRatio - 0.36) / 0.64, 0, 1);
  layer.style.opacity = (
    isBoosting ? Math.max(0.45, intensity) : intensity * 0.72
  ).toFixed(3);

  const pulse = performance.now() * (isBoosting ? 0.045 : 0.028);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const angle = Number(line.dataset.angle);
    const radius = Number(line.dataset.radius) + ((pulse + i * 6) % 28);
    const length = Number(line.dataset.length) * (isBoosting ? 1.55 : 1.0);
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    line.style.width = `${length}vw`;
    line.style.transform = `translate(${x}vw, ${y}vh) rotate(${angle}rad) translateX(${8 + intensity * 10}vw)`;
  }
}

/** Module store — Player writes; SpeedLines overlay reads via rAF. */
let speedRatio = 0;
let boosting = false;
const listeners = new Set<() => void>();

export function setSpeedFx(ratio: number, isBoosting: boolean): void {
  speedRatio = ratio;
  boosting = isBoosting;
  for (const fn of listeners) fn();
}

export function getSpeedFx(): { ratio: number; boosting: boolean } {
  return { ratio: speedRatio, boosting };
}

export function subscribeSpeedFx(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
