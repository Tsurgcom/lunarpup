/** One-shot teleport requests from the lunar map → Player. */

export type TeleportRequest = {
  x: number;
  z: number;
};

let pending: TeleportRequest | null = null;

export function requestTeleport(x: number, z: number): void {
  pending = { x, z };
}

export function consumeTeleport(): TeleportRequest | null {
  const next = pending;
  pending = null;
  return next;
}
