# AGENTS.md — Lunar Pup

Guidance for coding agents working in this repository.

## Project

Lunar Pup is a browser skate game: a geometric dog rides a board across moon
crater bowls. Built with **React Three Fiber**, **Drei**, and **Trystero**
(`@trystero-p2p/nostr`) for serverless P2P multiplayer.

## Commands

```bash
bun install          # install deps
bun run dev          # Vite dev server at http://localhost:3000
bun run build        # typecheck + production build
bun run preview      # preview dist/
bun test src/game/physics.test.ts   # physics unit tests
bunx tsc --noEmit    # typecheck only
```

Use **Bun** as the package manager/runtime. Port **3000** is configured with
`strictPort: true` in `vite.config.ts`.

## Architecture

```
src/
  main.tsx           # React entry
  App.tsx            # HUD + KeyboardControls + Canvas shell
  styles.css         # HUD overlay styles
  game/
    World.tsx        # Scene: lights, stars, terrain, player, rocks, remotes
    Player.tsx       # Local player loop (input → physics → mesh → net sync)
    CameraRig.tsx    # Arcade board-frame orbit; soft follow + boom susp
    MoonTerrain.tsx  # Heightfield mesh (clipmap patches)
    moonMaterial.ts  # MeshPhysicalMaterial + triplanar PBR + sun POM
    moonPbrMaps.ts   # Baked albedo / normal / ORM+height DataTextures
    sun.ts           # Shared sun direction for light / disc / crater shadows
    LunarRocks.tsx   # Pushable lunar rocks (parallel physics + meshes)
    terrain.ts       # Crater bowl height/normal sampling (shared by physics + mesh)
    physics.ts       # Newtonian integrator (forces, contact, ollie)
    physics.test.ts  # Bun tests for physics (excluded from tsc include)
    rockPhysics.ts   # Rock integrator + sphere collisions with player
    rockPhysics.test.ts
    localBody.ts     # Module-level local BodyState for rock collisions
    localPose.ts     # Module-level local pose for map / HUD
    SkateDog.tsx     # Procedural dog + board mesh
    RemotePlayers.tsx# Interpolated remote pups (reads peerStore in useFrame)
    multiplayer.ts   # Trystero room session + useMultiplayer hook
    peerStore.ts     # Module-level peer pose map (avoids React re-render spam)
    Hud.tsx          # Room UI, speed, connection status
    types.ts         # PlayerSnapshot, palettes, defaultRoomId()
```

### Data flow

1. `Player` reads keyboard via Drei `KeyboardControls`, calls `stepBody()` each frame,
   then publishes the body via `localBody` for rock collisions.
2. `LunarRocks` steps rocks in parallel (`rockPhysics`), then resolves sphere impulses
   against the local pup and other rocks.
3. `Player` broadcasts `PlayerSnapshot` ~20 Hz through `useMultiplayer().sendState`.
4. `multiplayer.ts` owns a **singleton Trystero session** (survives React StrictMode).
5. Remote poses land in `peerStore`; `RemotePlayers` interpolates in `useFrame`.

### Physics (`physics.ts`)

- Semi-implicit Euler: ΣF = ma, then contact impulses.
- Ground contact when `penetration >= 0` against the heightfield.
- Board yaw is kinematic from continuous lean (A/D ease in/out; harder turn at speed on ground); R/F pitch (nose up/down) is visual on ground and rotates attitude in air; roll follows lean.
- **No** hover, coyote time, or air-leveling hacks — keep physics honest unless asked.
- Tune constants at the top of `physics.ts`. Add/adjust tests in `physics.test.ts`.

### Terrain (`terrain.ts`)

- `sampleHeightDir` / `sampleNormalDir` must stay in sync with the visual mesh.
- `MoonTerrain` streams icosphere face patches; `moonMaterial.ts` shades regolith.
- Craters are cosine-profile bowls (`ANCHOR_CRATERS` + procedural fields).

### Multiplayer (`multiplayer.ts`)

- Strategy: **`@trystero-p2p/nostr`** with a small `RELAYS` list (fast connect).
- `APP_ID` and action namespace (`"pup"`) must match across clients.
- Session joins **eagerly on module load** (`ensureSession(defaultRoomId())`) so peers
  discover each other before React mounts.
- StrictMode: refcounted session + delayed `leave()` — do not call `room.leave()` per
  effect cleanup without the refcount pattern.
- Peer count comes from `room.getPeers()`, not just message receipt.
- `@trystero-p2p/torrent` is installed but unused; prefer Nostr unless switching deliberately.

### Camera (`CameraRig.tsx`)

- Arcade board-frame orbit: default seat behind the dog; smoothed chase axis;
  rate-limited distance/boom (no snap crust resolves); mouse orbit rate-capped.
- FOV widens only when idle; look soft-follows with mild velocity bias.

### Rendering

- R3F `Canvas` in `App.tsx`; game objects live under `World`.
- Mutate transforms in `useFrame` via refs — avoid per-frame React state for poses.
- Remote players: read `peerStore` in `useFrame`, lerp position/quaternion.

## Conventions

- **TypeScript strict** — preserve `verbatimModuleSyntax`; use `import type` where needed.
- **Minimal scope** — small, focused diffs; match existing file style.
- **Tests** — extend `physics.test.ts` when changing integrator behavior; run `bun test`.
- **No commits** unless the user asks.
- **Do not edit** `.agents/`, `skills-lock.json`, or generated `dist/` unless requested.

## Common tasks

| Task | Where to look |
| --- | --- |
| Change controls | `App.tsx` keyMap, `Player.tsx`, `physics.ts` `ControlInput` |
| Tune bowl shape | `terrain.ts` `CRATERS`, `sampleHeight` |
| Fix net sync | `multiplayer.ts`, `peerStore.ts`, `RemotePlayers.tsx` |
| HUD copy / room UX | `Hud.tsx`, `types.ts` `defaultRoomId` |
| Visual dog / board | `SkateDog.tsx` |
| Camera feel | `CameraRig.tsx` |

## Multiplayer smoke test

1. `bun run dev`
2. Open two tabs on `http://localhost:3000/?room=test`
3. HUD should show `pups nearby: 1` within a few seconds
4. Both tabs should see the other dog skating

First connect can take 1–3s while Nostr relays and WebRTC negotiate.
