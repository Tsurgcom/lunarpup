/** Module-level speed for the HUD chip — avoids App → Canvas re-renders. */

let speed = 0;
const listeners = new Set<() => void>();

export function setHudSpeed(next: number): void {
  const rounded = Math.round(next);
  if (rounded === speed) return;
  speed = rounded;
  for (const listener of listeners) listener();
}

export function getHudSpeed(): number {
  return speed;
}

export function subscribeHudSpeed(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
