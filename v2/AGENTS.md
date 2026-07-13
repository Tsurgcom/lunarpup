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
bun test --only-failures   # run unit tests
bunx tsc --noEmit    # typecheck only
```

Use **Bun** as the package manager/runtime. Port **3000** is configured with
`strictPort: true` in `vite.config.ts`.

## Architecture

```
src/
  main.tsx           # React entry
  App.tsx            # Phase machine + KeyboardControls + Canvas shell
  styles.css         # HUD / menu overlay styles
  game/
    World.tsx        # Scene: lights, stars, terrain, player, rocks, remotes, ghost
    Player.tsx       # Local player loop (input → physics → mesh → net sync)
    CameraRig.tsx    # Arcade board-frame orbit; soft follow + boom susp
    MoonTerrain.tsx  # Spherical clipmap (contact-height verts + LOD stitch)
    moonMaterial.ts  # Flat Lambert + baked vertex colors (mare/highland)
    LunarRocks.tsx   # Pushable lunar rocks (parallel physics + meshes)
    terrain.ts       # Sphere height/normal + clipmap topology (shared by physics + mesh)
    physics.ts       # Newtonian integrator (forces, contact, ollie, jetpack)
    physics.test.ts  # Bun tests for physics (excluded from tsc include)
    rockPhysics.ts   # Rock integrator + sphere collisions with player
    rockPhysics.test.ts
    localBody.ts     # Module-level local BodyState for rock collisions
    localPose.ts     # Module-level local pose for map / HUD
    SkateDog.tsx     # Procedural dog + board mesh
    RemotePlayers.tsx# Interpolated remote pups (reads peerStore in useFrame)
    multiplayer.ts   # Trystero room session + useMultiplayer hook
    peerStore.ts     # Module-level peer pose map (avoids React re-render spam)
    Hud.tsx          # Speed chip + LunarMap
    LunarMap.tsx     # Floating minimap; click to teleport
    teleport.ts      # One-shot warp request (map → Player)
    GhostRun.tsx     # Best-lap ghost mesh
    ghostLine.ts     # Session ghost trail record / replay
    Menus.tsx        # Start / pause / controls / credits
    types.ts         # PlayerSnapshot, palettes, defaultRoomId()
```

### Data flow

1. `Player` reads keyboard via Drei `KeyboardControls`, calls `stepBody()` each frame,
   then publishes the body via `localBody` for rock collisions.
2. `LunarRocks` steps rocks in parallel (`rockPhysics`), then resolves sphere impulses
   against the local pup and other rocks.
3. `Player` broadcasts `PlayerSnapshot` ~20 Hz through `useMultiplayer().sendState`.
4. `multiplayer.ts` owns a **singleton Trystero session** (survives React StrictMode).
   Session joins when `useMultiplayer(roomId, enabled)` runs with `enabled=true`
   (after leaving the start menu) — not on module load.
5. Remote poses land in `peerStore`; `RemotePlayers` interpolates in `useFrame`.

### Physics (`physics.ts`)

- Semi-implicit Euler: ΣF = ma, then hoverboard spring-damper contact.
- Grounded when within a soft hover band above the heightfield (no hard snap).
- Board yaw is kinematic from continuous lean (A/D ease in/out; harder turn at speed on ground); R/F pitch (nose up/down) is visual on ground and rotates attitude in air; roll follows lean.
- Shift burns jet fuel (recharges on deck). Space ollies.
- Hover spring floats the deck near clearance; normals soft-follow terrain so slope joins stay smooth.
- Tune constants at the top of `physics.ts`. Add/adjust tests in `physics.test.ts`.

### Terrain (`terrain.ts`)

- `sampleHeightDir` / `sampleContactHeightDir` share the same analytic crust
  (mesh verts + physics). Bowls use soft cosine profiles — no sheer cliffs.
- `MoonTerrain` streams a spherical clipmap (`CLIPMAP_LODS`): denser near the
  pup, coarser on the horizon. Adjacent faces promote to the finer shared
  subdiv (`stitchFaceSubdivs`) so LOD rings do not crack.
- Craters are cosine-profile bowls: hand-placed `ANCHOR_CRATERS` plus a fixed
  OG-lattice `getCraterCatalog()` (spatial buckets, no cube-lattice ownership).
- Rendering: Lambert + vertex colors + studio key light (`World.tsx`); no PBR maps.

### Multiplayer (`multiplayer.ts`)

- Strategy: **`@trystero-p2p/nostr`** with a small `RELAYS` list (fast connect).
- `APP_ID` and action namespace (`"pup"`) must match across clients.
- Join via `acquireSession` from `useMultiplayer` when play starts (`enabled`).
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
- Frame order: Player physics (−2) → rocks/light (−1) → pup mesh/pose (0) →
  clipmap (0, after Player in tree). Mutate transforms via refs.
- Local pup: rigid `SkateDog` (Lambert, `frustumCulled={false}`); no feel bobbing.
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
| Tune bowl shape | `terrain.ts` `ANCHOR_CRATERS`, `sampleHeightDir` |
| Fix net sync | `multiplayer.ts`, `peerStore.ts`, `RemotePlayers.tsx` |
| HUD / minimap / warp | `Hud.tsx`, `LunarMap.tsx`, `teleport.ts` |
| Frame debug (`?debug`) | `DebugPanel.tsx`, `debugFrame.ts` |
| Ghost line | `ghostLine.ts`, `GhostRun.tsx`, `Menus.tsx` |
| Menu / pause UX | `Menus.tsx`, `App.tsx` phase machine |
| Visual dog / board | `SkateDog.tsx` |
| Camera feel | `CameraRig.tsx` |

## Multiplayer smoke test

1. `bun run dev`
2. Open two tabs on `http://localhost:3000/?room=test`
3. Leave the start menu on both (session joins on play)
4. HUD / status should show a peer within a few seconds
5. Both tabs should see the other dog skating

First connect can take 1–3s while Nostr relays and WebRTC negotiate.
