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

export function defaultRoomId(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get("room") ?? "moon-bowl";
}
