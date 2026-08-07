# AGENTS.md — Lunar Pup

Guidance for coding agents working in this repository.

## Project

Lunar Pup is a **playable** browser moon-skate game and hackathon starter,
built with **React Three Fiber**, **Drei**, **Three.js**, and (when needed)
**Trystero** (`@trystero-p2p/nostr`).

The repo root *is* the game. There are no archived alternate versions —
extend `src/` directly.

## Commands

```bash
bun install          # install deps
bun run dev          # Vite dev server at http://localhost:3000
bun run build        # typecheck + production build
bun run preview      # preview dist/
bun test             # Bun tests (root = ./src)
bunx tsc --noEmit    # typecheck only
bun run check        # Biome check
```

Use **Bun** as the package manager/runtime. Port **3000** is configured with
`strictPort: true` in `vite.config.ts`.

## Architecture

```
src/
  main.tsx       # React entry
  App.tsx        # Phase machine (menu / lobby / play / pause) + Canvas
  styles.css     # Overlay / HUD / menu styles
  game/
    World.tsx           # Scene root (terrain, player, remotes, FX)
    Player.tsx          # Local rider + input → physics
    movement.ts         # Thrust / steer / boost integration
    rideShell.ts        # Surface planting / grounding
    CameraRig.tsx       # Follow / bank / speed juice
    ChunkTerrain.tsx    # Chunk mesh + worker rebuilds
    lunarTerrain.ts     # Heightfield / PCG
    multiplayer.ts      # Party + world session hooks
    party.ts / partyNet.ts / worldNet.ts
    Menus.tsx / Hud.tsx / TouchControls.tsx
    performanceTiers.ts # Adaptive graphics settings
    physicsTuning.ts    # Live tweak knobs (debug)
```

Prefer small, focused changes over wholesale rewrites. Match existing file
style and keep gameplay feel stable unless the task is retuning physics.

## Conventions

- **TypeScript strict** — preserve `verbatimModuleSyntax`; use `import type`
  where needed.
- **Minimal scope** — small, focused diffs; do not drive-by refactor.
- **No commits** unless the user asks.
- **Do not edit** `.agents/`, `skills-lock.json`, or generated `dist/` unless
  requested.
- Hot paths (movement, chunk LOD, net) — prefer plain modules + refs over
  React state.
