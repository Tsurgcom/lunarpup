/** One-shot teleport requests from the lunar map → Player. */

export type TeleportRequest = {
  /** Moon-centered point (direction is taken from this vector). */
  x: number;
  y: number;
  z: number;
};

let pending: TeleportRequest | null = null;

export function requestTeleport(x: number, y: number, z: number): void {
  pending = { x, y, z };
}

export function consumeTeleport(): TeleportRequest | null {
  const next = pending;
  pending = null;
  return next;
}
