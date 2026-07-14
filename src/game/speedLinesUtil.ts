import * as THREE from "three";

const LINE_COUNT = 52;

export type SpeedFx = {
  /** 0..1 cruise speed ratio. */
  speed: number;
  /** 0..1 airborne hang (from airTime). */
  air: number;
  /** 0..~1.2 touchdown punch. */
  land: number;
  boosting: boolean;
};

const EMPTY_FX: SpeedFx = { speed: 0, air: 0, land: 0, boosting: false };

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

/**
 * Velocity + air + landing streaks. Intensity from speed, hang, and punch.
 */
export function updateSpeedLines(
  lines: HTMLDivElement[],
  layer: HTMLElement,
  fx: SpeedFx,
) {
  const speedI = THREE.MathUtils.clamp((fx.speed - 0.32) / 0.68, 0, 1);
  const airI = fx.air * 0.55;
  const landI = Math.min(1, fx.land) * 0.9;
  const boostI = fx.boosting ? 0.18 : 0;
  const intensity = THREE.MathUtils.clamp(speedI + airI + landI + boostI, 0, 1);

  layer.style.opacity = (intensity * 0.88).toFixed(3);
  layer.dataset.air = fx.air > 0.08 ? "1" : "0";
  layer.dataset.land = fx.land > 0.12 ? "1" : "0";
  layer.dataset.boost = fx.boosting ? "1" : "0";

  const pulse = performance.now() * (0.024 + intensity * 0.02 + fx.air * 0.008);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const angle = Number(line.dataset.angle);
    const radius = Number(line.dataset.radius) + ((pulse + i * 6) % 28);
    const length =
      Number(line.dataset.length) *
      (1 + intensity * 0.55 + fx.air * 0.25 + landI * 0.35);
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    line.style.width = `${length}vw`;
    line.style.transform = `translate(${x}vw, ${y}vh) rotate(${angle}rad) translateX(${8 + intensity * 10}vw)`;
  }
}

/** Module store — Player writes each frame; SpeedLines rAF paints. */
const speedFx: SpeedFx = { ...EMPTY_FX };

export function setSpeedFx(
  speed: number,
  air = 0,
  land = 0,
  boosting = false,
): void {
  speedFx.speed = speed;
  speedFx.air = air;
  speedFx.land = land;
  speedFx.boosting = boosting;
}

export function getSpeedFx(): SpeedFx {
  return speedFx;
}
