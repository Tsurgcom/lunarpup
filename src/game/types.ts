export type PlayerSnapshot = {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  roll: number;
  speed: number;
  fur: string;
  accent: string;
  name: string;
  /** Paused players appear translucent to peers. */
  ghost?: boolean;
};

export const FUR_PALETTE = [
  "#e8b86d",
  "#f2e0c8",
  "#c49a6c",
  "#ffe0a0",
  "#a87850",
  "#fff0d8",
];

export const ACCENT_PALETTE = [
  "#ff8fab",
  "#7dcea0",
  "#7eb6ff",
  "#ffe566",
  "#ff9a6c",
  "#c3aed6",
];

export function pickStyle(seed: string): { fur: string; accent: string } {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const fur = FUR_PALETTE[h % FUR_PALETTE.length]!;
  const accent = ACCENT_PALETTE[(h >>> 3) % ACCENT_PALETTE.length]!;
  return { fur, accent };
}

/** Skate world id from URL (`?world=` or legacy `?room=`). */
export function defaultWorldId(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get("world") ?? params.get("room") ?? "moon-bowl";
}

/** Party invite from URL (`?party=`), or null. */
export function defaultPartyId(): string | null {
  const params = new URLSearchParams(window.location.search);
  const party = params.get("party");
  return party && party.trim() ? party.trim() : null;
}

/** @deprecated Use defaultWorldId */
export function defaultRoomId(): string {
  return defaultWorldId();
}

const PARTY_CODE_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";

/** Short readable party code, e.g. `pup-a1b2c3`. */
export function generatePartyCode(): string {
  let suffix = "";
  const n = PARTY_CODE_CHARS.length;
  for (let i = 0; i < 6; i++) {
    const ch = PARTY_CODE_CHARS[Math.floor(Math.random() * n)];
    suffix += ch ?? "x";
  }
  return `pup-${suffix}`;
}

export function writeWorldToUrl(world: string): void {
  const url = new URL(window.location.href);
  url.searchParams.set("world", world);
  url.searchParams.delete("room");
  window.history.replaceState({}, "", url);
}

export function writePartyToUrl(party: string | null): void {
  const url = new URL(window.location.href);
  if (party) url.searchParams.set("party", party);
  else url.searchParams.delete("party");
  window.history.replaceState({}, "", url);
}
