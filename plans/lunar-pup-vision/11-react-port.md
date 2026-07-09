STATUS: open
PRIORITY: P0
COMPLEXITY: high
TOUCHES: merge of origin/main (React Three Fiber rewrite) into our integration main; src/r3f-shell/, src/ui/, src/game/, src/net/client.ts, package.json
BLOCKED_BY: ui-reskin land

# 11 — Merge upstream R3F rewrite and port our client systems into the React shell

Upstream merged the renderer rewrite (PRs #7, #18, #20, #23, #24): client is now React
Three Fiber (`src/r3f-shell/`, entry `src/r3f-shell/main.tsx`), simulation extracted into
tested modules (`playerPhysics.ts`, `trickSimulation.ts`, `terrainMath.ts`), vanilla
renderer fallback deleted. None of our PRs are merged yet. Our server-side systems are
untouched; our client panels/menus/hooks must be ported into the React shell.

## Verified facts from a trial merge (temp worktree, `git merge origin/main` on our main)

Only 12 files conflict: AGENTS.md, README.md, bun.lock, package.json,
src/game/{bootstrap,loop,multiplayer,player}.ts, src/net/client.ts,
src/net/protocol.test.ts (AA), src/server.ts, src/ui/multiplayer.ts.
Everything else (src/contracts, src/server/, src/storage, src/solana, src/cosmetics,
src/modes, src/extensions, content/, our tests, tokens.css) merges clean.

## Deterministic resolution guide (validated in the trial merge)

- **package.json**: union of deps — keep BOTH sides (@react-three/fiber, react, react-dom
  from theirs; @solana/*, bs58, tweetnacl from ours; three shared). Keep merged scripts
  as-is. `module` stays `src/r3f-shell/main.tsx` (theirs).
- **bun.lock**: take theirs, then `bun install` regenerates after package.json resolve.
- **src/server.ts**: keep OURS wholesale (modular router + DI + CORS). Their only server
  addition (chat rate-limit via `lastChat`) must be ported into
  `src/server/multiplayer.ts`: add `lastChat?: { text: string; ts: number }` to
  PlayerConnection and in handleChat, before broadcast:
  drop if `now - recent.ts < 1000`, or same text within 3000ms; then set lastChat.
- **src/game/player.ts**: their `VoxelDogParts` (adds optional `playerGroup`) + their new
  `bindPlayerParts()` + OUR `createVoxelDog` signature
  (`dogColor: number = PLAYER_COLORS[0] ?? 0xffb703, deckColor: number = 0xff5555`).
  Keep our cosmetics attach points (tintLocalDog etc.).
- **src/game/multiplayer.ts**: keep both — our `setLocalEquippedCosmetics` block AND their
  `isLocalMultiplayerId` helper.
- **src/net/client.ts**: keep both — our room-lobby methods (listRooms/createRoom/
  joinLobbyRoom/leaveLobbyRoom/startGamemode + room_list/room_state/start_gamemode cases)
  AND their `sendChat(): boolean` signature change (adopt boolean return).
- **src/net/protocol.test.ts** (both added): combine both test files' cases into one.
- **README.md / AGENTS.md**: combine sections from both sides; nothing conflicts
  semantically.
- **src/ui/multiplayer.ts**: adopt THEIR React binding architecture
  (`MultiplayerPanelBinding` + `bindMultiplayerPanel`, updates via `activeBinding`), and
  port our room browser onto it: extend the binding with a `rooms: HTMLDivElement`
  container plus create-form elements, keep our refreshRooms/renderRooms/createRoom/
  joinRoom logic writing into the bound elements. `roomHttpUrl()` uses `getApiBaseUrl()`
  from protocol.ts (ours) when no wsUrl.
- **src/game/loop.ts + bootstrap.ts**: the vanilla animate loop and dynamic-import
  bootstrap are replaced by the React shell. PORT, don't merge:
  - `registerUpdateHook` set + current-gamemode tick + pause gating (`pauseController`,
    `runFrame`) + menu orbit (`setMenuOrbit`) move into a module the R3F frame loop calls:
    hook into their `GameCanvas`/`Player.tsx` `useFrame` path so hooks and gamemode tick
    run once per frame with dt, respecting pause.
  - Whatever remains useful in bootstrap.ts should shrink to nothing or a thin legacy
    shim; entry is `r3f-shell/main.tsx`.

## Mounting our panels in the React shell (the port half)

Follow their established pattern (see `MultiplayerPanel.tsx`): React component renders
skeleton DOM + refs, `useEffect` calls a `bind*` function from the ui module, returns
unbind. Port each of ours:
- cosmetics shop (`src/ui/cosmetics.ts` setupCosmeticsUI → CosmeticsPanel.tsx binding)
- mode select / results (`src/modes/client.ts`)
- main menu + pause menu (`src/ui/mainMenu.ts`, `pauseMenu.ts`) — including panel
  suppression while menus are open (hide the other panels; App-level state is fine)
- extension client loader (`src/extensions/client.ts` — fetch `/extensions`, dynamic
  import, each extension's setupClient may append its own DOM; call it from an App effect)
- keep tokens.css imported and the ui-reskin styling intact.

## Done when

- `bun install && bun run typecheck && bun run test && bun scripts/smoke.ts` green.
- Browser check (dev server): game renders through R3F, shop loads catalog and buy works,
  room browser lists/creates rooms, main menu and pause menu work with panels suppressed,
  lootbox reveal works, no console errors.
- A short `## Resolution` note added here.
