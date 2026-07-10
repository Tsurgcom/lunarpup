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
  "#d4a574",
  "#c9c2b8",
  "#8b7355",
  "#e8d5b7",
  "#6b5344",
  "#f2e6d8",
];

export const ACCENT_PALETTE = [
  "#f0c27a",
  "#7dcea0",
  "#7eb6ff",
  "#ff8fab",
  "#e8a87c",
  "#c3aed6",
];

export function pickStyle(seed: string): { fur: string; accent: string } {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return {
    fur: FUR_PALETTE[h % FUR_PALETTE.length]!,
    accent: ACCENT_PALETTE[(h >> 3) % ACCENT_PALETTE.length]!,
  };
}

export function defaultRoomId(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get("room") ?? "moon-bowl";
}
