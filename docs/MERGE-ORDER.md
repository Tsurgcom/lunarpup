# Roadmap PR chain — merge order and current status

Living document for maintainers merging the roadmap work (lmvdz's PR chain). The
previous guidance lived only in PR #1's description; #1 is merged, so it moves here.
Updated: 2026-07-09, after #1, #19 (E2E relay), #25 (CI), and #26 (R3F consolidation)
merged.

## Current state, in one paragraph

The roadmap chain (#4 … #17) was built on a linear integration branch: each PR's branch
is a snapshot containing every PR before it, so merging in order is conflict-free and
each diff reviews as one unit. PR #27 reconciles that chain with the R3F rewrite — but
upstream has moved again since #27's merge base (#19, #25, #26 all touch adjacent code),
so **#27 is being refreshed against tip on the fork side; don't merge it until the
refresh lands and CI is green** (a comment on #27 will say so explicitly).

## Review order (unchanged — each PR's own slice)

1. **#4** foundation — contracts, server router, loop hooks, sqlite services
2. **#6** AI-harness integration *(superseded in part by #21's extension extraction)*
3. **#8** TimescaleDB adapter
4. **#12** Solana devnet layer
5. **#9** rooms & lobbies
6. **#10** cosmetics
7. **#11** gamemodes (race + parkour)
8. **#13** hotfix: browser-safe sha256, API origin, CORS
9. **#14** lootboxes
10. **#15** owner-scoped agent events
11. **#16** UI research (docs) · **#21** extension packages · **#22** UI overhaul part 1
12. **#17** integration (token payments, NFT mints, leaderboards, smoke)
13. **#27** upstream-reconciliation + React port — **merge this one; the rest collapse**

## What to actually do

- **Reviewing**: read the slices above in order; each body carries `TOUCHES:` and its
  gate results per CONTRIBUTING.
- **Merging**: wait for the refreshed #27 (it will contain every slice, rebased onto
  current main, CI green, browser-verified). Merging #27 auto-collapses #4–#22 to
  merged/empty. Cherry-picking older stacked PRs first creates noise, not progress.
- The fork's `integration-main` branch always mirrors the fully-integrated state.

## Coordination notes

- **#25 CI**: every PR now gates on the Actions verify workflow — the chain's shared
  gate (`typecheck && test && smoke`) matches it.
- **E2E blind relay (#5/#19) × cosmetics sync**: the roadmap adds an optional
  `cosmetics` field to `PlayerSnapshot`. With the encrypted relay, the server cannot
  read snapshot payloads — cosmetics rendering stays client-side (fine), but any future
  server-side validation of equipped cosmetics must use the authoritative inventory
  API, not the snapshot. Tracked in the fork's `plans/lunar-pup-vision/13-*` concern.
- **In flight on the fork**: panel UX redesign (concern 12 — HUD-only play, focused
  views), then the upstream-refresh merge (concern 13) that updates #27.
