# Lunar Pup — full vision build

The game you play while your AI agents work. A Three.js moon-skating game that connects to
any AI agent harness, entertains you during the dead time, and barks the moment your agent
needs human input. Cosmetics, gamemodes, and a Solana-powered economy layered on top — all
built as shareable, mod-like content packages.

## Product principles

1. **The harness integration is the moat.** Notification-when-agent-needs-you is the wedge
   feature; the game must stay interruptible with grace (short runs, instant pause).
2. **Fun before finance.** The token/NFT layer plugs into a cosmetics system that works
   without it. A cosmetic is a content-addressed package; an NFT is just an on-chain pointer
   to a package id. No chain code inside game code.
3. **Everything is a package.** Cosmetics and gamemodes are content-addressed JSON+asset
   bundles (sha256 manifest id) — shareable like mods from day one.
4. **Devnet until a human says otherwise.** All Solana work targets devnet. The mainnet
   token launch is a script that exists but is gated on explicit human action. Lootboxes
   ship with disclosed odds and an audit ledger; token-in/NFT-out gambling has real
   regulatory exposure (BE/NL/UK/AU) and needs counsel + region gating before mainnet.

## Architecture direction

- **Foundation first** (concern 01): shared contracts (agent-event protocol, package
  manifest, cosmetic schema, gamemode interface, room protocol, currency/inventory +
  event-ledger interfaces), a modular server router, and game-loop extension hooks — so all
  feature units build against stable seams instead of editing the same files.
- **Storage**: `bun:sqlite` is the zero-setup dev default behind repository interfaces.
  **TimescaleDB** is the production adapter (concern 07) for the three genuinely
  time-series datasets: agent-harness telemetry, race/parkour run samples (doubles as ghost
  replay data), and the economy/lootbox audit ledger (drop-rate proofs, token-flow
  analytics). Inventory/room state stays key-value shaped — not Timescale's job.
- **Execution**: omp-squad fleet; every concern is an isolated worktree agent with a
  `bunx tsc --noEmit && bun test` acceptance gate, landed via verified merge.

## Dependency graph / dispatch waves

```
wave 0:  01-foundation-contracts          (dispatched — everything builds on it)
wave 1:  02-harness-notifications  ┐
         03-cosmetics-shop         │
         04-gamemodes-race-parkour ├─ parallel, after 01 lands
         05-solana-devnet          │
         06-rooms-lobbies          │
         07-timescale-persistence  ┘
wave 2:  08-lootbox                       (after 03: needs item pools + inventory)
wave 3:  09-integration-smoke             (after 03/05/07/08: token payments in shop,
                                           NFT mint on drops, leaderboards, docs, e2e)
```

## Done means

Every concern closed, `bunx tsc --noEmit && bun test` green on main, and a live smoke:
server boots, a fake harness event triggers the in-game notification, a race completes, a
lootbox opens with ledger entries written, and a devnet wallet round-trip works.
