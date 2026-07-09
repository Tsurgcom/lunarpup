# Lunar Pup: Safe R3F + Multiplayer Roadmap

Purpose: move existing Lunar Pup from modular vanilla Three.js toward React Three Fiber without changing game feel, visuals, controls, or multiplayer behavior during migration.

Rule: every phase must preserve a runnable baseline. No redesign, new gameplay, asset overhaul, or infrastructure swap until parity checks pass.

## Current baseline

- Baseline commit: `771226329a9f4508fb6e56d0f7c3bc3af53d717a` on `main`.
- Branch sync: rebased onto upstream commit `c20235c` (`Reduce multiplayer chat spam with rate limits and dedupe`), including upstream Netlify versioning, chat, minimap, and aerial trick work.
- Current working-tree change: R3F runtime-hook fix plus checklist update; commit before handoff.

- [x] Record current commit SHA and branch.
- [x] Run `bun install` (Bun reported one cache permission warning; existing dependency graph remained usable).
- [x] Run `bun run dev` and verify browser game loads. Fixed the R3F `useFrame` placement error (`Hooks can only be used within the Canvas component`); browser smoke now shows HUD, tuning sliders, minimap, chat, and live terrain chunk count with no console error.
- [x] Run `bun run build` and verify production build after latest upstream sync. Build completed and emitted split bundles.
- [x] Run `bun test`: 7 tests pass.
- [x] Run `bun run typecheck`: passes.
- [x] Run `bun run dev:server` and verify WebSocket server starts. Server reported `ws://localhost:3001`.
- [ ] Test keyboard controls: accelerate, reverse, steer, jump, boost.
- [ ] Test mouse camera drag and wheel zoom.
- [ ] Test tuning sliders, copy, and reset interactions. Full production controls are now present in the R3F shell; interaction replay still pending.
- [ ] Test terrain chunk generation while travelling.
- [ ] Test multiplayer join, remote player movement, leave, and reconnect behavior.
- [ ] Capture baseline screenshots and a short gameplay recording.
- [ ] Record baseline FPS, memory, bundle size, and server message rate.

## Non-negotiable parity contract

- [ ] Same terrain generation and chunk boundaries.
- [ ] Same player geometry, materials, shadows, and animation.
- [ ] Same physics constants and frame behavior.
- [ ] Same camera orbit, zoom, follow, and FOV behavior.
- [ ] Same input mappings and tuning panel behavior.
- [ ] Same speed lines and HUD output.
- [ ] Same multiplayer protocol and snapshot semantics.
- [ ] No new dependency or architecture change without a passing baseline build.

## Phase 1: isolate current runtime

Goal: create React infrastructure without using it to rewrite the game.

- [x] Create `feat/r3f-shell` from clean `main`.
- [x] Add React, React DOM, and Fiber only; no Vite migration.
- [x] Keep current Bun entrypoint working.
- [x] Add separate `dev:r3f` and `build:r3f` entrypoints.
- [x] Render a blank R3F `<Canvas>` through `index.r3f.html`.
- [x] Add optional R3F renderer host adapter without changing vanilla bootstrap behavior.
- [x] Add R3F external frame-step adapter for existing physics, terrain, camera, UI, and multiplayer systems.
- [x] Make R3F the default `index.html` entry.
- [x] Preserve exact pre-migration shell as `index.vanilla.html` with `dev:vanilla` and `build:vanilla` fallback commands.
- [x] TypeScript check passes after fixing upstream Bun/Three strictness errors.
- [ ] Confirm vanilla game still runs unchanged in browser. Earlier smoke test passed; latest upstream parity replay still pending.
- [ ] Do not move terrain, player, physics, UI, or network code yet.

Exit gate: vanilla mode screenshot, controls, multiplayer, and production build match baseline. Current status: both vanilla and R3F builds pass after upstream sync; browser/gameplay verification pending.

## Phase 2: R3F owns renderer only

Goal: let R3F own Canvas/renderer lifecycle while existing systems still own game behavior.

- [x] Create the R3F shell in `src/r3f-shell/App.tsx` and `src/r3f-shell/GameCanvas.tsx`.
- [x] Configure Canvas renderer settings to match current Three.js renderer.
- [ ] Preserve antialiasing, pixel ratio cap, color space, tone mapping, shadows, fog, and camera defaults.
- [x] Pass R3F scene, camera, and renderer references into an adapter.
- [x] Replace manual `renderer.render()` with R3F's render loop for R3F mode; vanilla mode retains manual rendering.
- [ ] Move resize ownership to R3F; retain camera aspect/FOV behavior.
- [ ] Keep existing imperative game modules behind `src/compat/legacyGameAdapter.ts`.
- [ ] Add cleanup for event listeners, timers, WebSocket connections, geometries, and materials.

Exit gate: screenshot diff and control replay show no meaningful visual or gameplay change. Current status: R3F is default; vanilla fallback is preserved; manual parity test pending.

## Phase 3: migrate scene systems one at a time

Order matters. One subsystem per PR or isolated commit.

- [ ] Scene/lights/background.
- [ ] Terrain chunk container.
- [ ] Terrain height and normal math as pure TypeScript functions.
- [ ] Player group.
- [ ] Camera rig.
- [ ] Input hook.
- [ ] Speed lines.
- [ ] Tuning UI.
- [ ] Remote players.
- [ ] Remove old imperative ownership only after parity test passes.

Use R3F `useFrame` for per-frame mutation. Do not put position, rotation, speed, or network snapshots into React state every frame.

## Phase 4: reusable content system

Goal: animal, board, material, and cosmetic variation without coupling gameplay to one model.

Target contracts:

```ts
type AnimalDefinition = {
  id: string;
  modelUrl: string;
  animations?: Record<string, string>;
  scale: number;
  attachmentPoints: Record<string, [number, number, number]>;
};

type SkateboardDefinition = {
  id: string;
  modelUrl: string;
  wheelRadius: number;
  deckOffset: [number, number, number];
};

type MaterialDefinition = {
  id: string;
  textureUrl?: string;
  color?: string;
  roughness?: number;
  metalness?: number;
};
```

- [x] Add registries for animals, boards, and materials in `src/content/`.
- [x] Keep physics independent from model geometry in the content contracts.
- [x] Define model-agnostic `PlayerLoadout` IDs for future network/session messages.
- [ ] Add effects registry.
- [ ] Load GLTF assets through `useLoader`/Drei with `Suspense`.
- [ ] Preload stable assets.
- [ ] Define disposal ownership for cached/global assets.
- [ ] Add placeholder fallback for missing cosmetics.
- [ ] Add one alternate cosmetic only after baseline parity is locked.

## Phase 5: state boundaries

- [ ] Keep high-frequency simulation in mutable refs or existing runtime state.
- [ ] Use Zustand only for coarse UI/session state: selected cosmetics, room, connection status, settings.
- [ ] Use narrow selectors for React components.
- [ ] Keep derived values derived; avoid duplicated store state.
- [ ] Do not make React re-render at animation-loop frequency.
- [ ] Separate local simulation state from replicated network state.

## Phase 6: multiplayer hardening

Current server is a Bun WebSocket relay with room membership and player snapshots.

- [x] Define room capacity (`32`) and reject excess players with HTTP `409`.
- [x] Validate replicated player state for finite numeric values and boolean grounded state.
- [ ] Add heartbeat/ping and stale connection cleanup.
- [ ] Add reconnect with backoff and room rejoin.
- [ ] Add message validation, size limits, and rate limits.
- [ ] Add server-side room lifecycle metrics.
- [ ] Decide authority model: relay-only first; authoritative movement later if needed.
- [ ] Interpolate remote players; never snap ordinary updates.
- [ ] Add protocol versioning.
- [ ] Add test clients for join/state/leave/reconnect.
- [ ] Load test rooms with realistic snapshot frequency.
- [ ] Keep player cosmetics in join/session messages, not per-frame snapshots.

### Networking decision

R3F does not provide or require a networking layer. It owns the Three.js render tree and render loop; multiplayer remains a separate client/server system.

Current raw WebSocket relay is valid for a prototype, but it does not provide authoritative simulation, schema synchronization, matchmaking, reconnect handling, or scaling by itself.

Preferred evaluation order:

1. **Colyseus** for the next multiplayer architecture: authoritative rooms, matchmaking, state schemas, reconnect support, and a TypeScript-friendly game server.
2. **Raw WebSocket** only if we deliberately keep a small custom protocol and implement validation, rooms, heartbeat, reconnect, rate limits, interpolation, and authority ourselves.
3. **Socket.IO** if transport fallback, acknowledgements, rooms, and reconnection convenience matter more than a lean game protocol. It is not compatible with the existing plain WebSocket server without changing both sides.
4. **WebRTC/P2P** is not the default choice: difficult authority/cheat prevention, host migration, NAT concerns, and poor fit for persistent shared rooms.
5. **WebTransport** can be revisited later, but adds deployment and server complexity without helping the first safe migration.

Recommended target:

```text
R3F client
  ├── local simulation + presentation
  ├── WebSocket/Colyseus client
  └── interpolation of remote state

Persistent game server
  ├── authoritative room simulation
  ├── matchmaking and room limits
  ├── validated inputs
  └── replicated state snapshots

Netlify
  ├── static R3F frontend
  └── Functions for HTTP-only helpers such as auth, room discovery, and health checks
```

No networking migration until current protocol behavior is captured in tests.

## Phase 7: Netlify deployment architecture

Netlify should host the static frontend and HTTP/serverless helpers. Netlify Functions are not a substitute for a long-lived multiplayer WebSocket process.

Recommended layout:

```text
Netlify static site
  ├── R3F client bundle
  ├── Netlify Functions: auth, room discovery, health checks
  └── WebSocket URL → persistent Bun WebSocket service
```

- [ ] Deploy frontend to Netlify from GitHub.
- [x] Add `netlify.toml` with Bun-compatible build command/output.
- [ ] Keep WebSocket server on a persistent WebSocket-capable host.
- [ ] Add production `VITE_WS_URL`/public runtime configuration.
- [ ] Add CORS/origin validation.
- [ ] Add health endpoint.
- [ ] Add environment variable documentation.
- [ ] Add preview deployment smoke test.
- [ ] Test disconnects, reconnects, cold starts, and multiple rooms.
- [ ] Do not depend on in-memory state across serverless invocations.

## Phase 8: verification and PR policy

- [ ] One concern per branch.
- [ ] No direct pushes to `main`.
- [ ] Every migration phase gets a draft PR.
- [ ] PR includes screenshots, test commands, and known differences.
- [ ] Friend reviews/approves before merge.
- [ ] Merge only after build, parity, multiplayer, and performance checks pass.

## Current draft PR

- [x] Push `feat/r3f-shell` to fork `zmack12344321/lunarpup`.
- [x] Open draft PR #7: https://github.com/Tsurgcom/lunarpup/pull/7
- [ ] Manual gameplay parity review.
- [ ] Buddy review and approval.
- [ ] Address requested changes.
- [ ] Convert draft to ready for review.
- [ ] Merge after checks and approval.
- [ ] Tag a rollback commit before each architectural phase.

## Context7 references used

- React Three Fiber: `/pmndrs/react-three-fiber`
  - `Canvas`, `useFrame`, `useThree`, reusable components, `Suspense`, `useLoader`, disposal.
- Netlify: `/websites/netlify`
  - Functions, Edge Functions, Background Functions, and platform boundaries.
- Zustand: `/pmndrs/zustand`
  - selectors, derived state, shallow selection, and render avoidance.

## First implementation target

Only after baseline capture:

1. Add React/R3F dependencies.
2. Add parallel R3F shell.
3. Keep vanilla game as fallback.
4. Port renderer lifecycle.
5. Compare screenshot/control replay.
6. Stop and fix any mismatch before migrating the next subsystem.
