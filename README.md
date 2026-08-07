# Lunar Pup

Playable browser moon-skate starter for hackathons.

Stack: **React**, **React Three Fiber**, **Drei**, **Three.js**, and optional
P2P multiplayer via **Trystero** (`@trystero-p2p/nostr`). Package manager:
**Bun**.

## Quick start

```bash
bun install
bun run dev
```

Open [http://localhost:3000](http://localhost:3000).

```bash
bun run build    # typecheck + production build
bun run preview  # serve dist/
bun test         # unit tests under src/
bun run check    # Biome lint + format check
```

## Controls

| Input | Action |
| --- | --- |
| `W` / `↑` | Thrust |
| `S` / `↓` | Brake / reverse |
| `A` `D` / `←` `→` | Steer |
| `R` / `F` | Pitch |
| `Q` / `E` | Roll |
| `Space` | Jump |
| `Shift` | Boost |
| `Esc` | Pause |

Touch / mobile: on-screen stick + buttons appear when needed.

## What’s included

- Sphere moon with chunked procedural terrain and LOD
- Ride-shell physics, boost, camera juice, HUD
- Start / lobby / pause menus, party codes, world IDs
- Optional multiplayer (Trystero over Nostr relays)
- Adaptive performance tiers and a debug / tweaking panel

Fork it, break it, ship a mode — the game at `src/` is the starting line.

## Project layout

```
src/
  main.tsx          # React entry
  App.tsx           # Menus, Canvas, session wiring
  styles.css        # Overlay / HUD / menu styles
  game/             # World, player, physics, net, HUD, terrain
vite/
  cssClassObfuscator.ts
```

Agent guidance lives in [`AGENTS.md`](AGENTS.md). Cursor skills under
`.agents/skills/` cover Three.js, R3F, physics feel, and React performance.
