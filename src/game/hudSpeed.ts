/** Module-level speed for the HUD chip — avoids App → Canvas re-renders. */

/** Display scale: physics m/s → HUD "Units" (U/S). */
const HUD_SPEED_SCALE = 10;

let speed = 0;
let boosting = false;
const listeners = new Set<() => void>();

export function setHudSpeed(next: number, isBoosting = false): void {
  const rounded = Math.round(next * HUD_SPEED_SCALE);
  if (rounded === speed && isBoosting === boosting) return;
  speed = rounded;
  boosting = isBoosting;
  for (const listener of listeners) listener();
}

export function getHudSpeed(): number {
  return speed;
}

export function getHudBoosting(): boolean {
  return boosting;
}

export function subscribeHudSpeed(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
