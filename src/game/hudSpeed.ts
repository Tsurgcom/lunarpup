/** Module-level speed for the HUD chip — avoids App → Canvas re-renders. */

let speed = 0;
let boosting = false;
const listeners = new Set<() => void>();

export function setHudSpeed(next: number, isBoosting = false): void {
  const rounded = Math.round(next);
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
