STATUS: closed
PRIORITY: P1
COMPLEXITY: high
TOUCHES: src/r3f-shell/ panels, src/ui/, src/styles.css, tokens.css
BLOCKED_BY: 11 (react-port)

# 12 — UI/UX redesign: the screen belongs to the gameplay

User direction: the main menu is right; everything else bloats screen real estate and
distracts from the core loop. This concern defines WHERE every element lives and WHEN it
appears. It re-homes the already-built patterns (tokens, rarity system, confirm/revert,
reel reveal) — it does not restyle them again.

## The three strata

**1. Ambient HUD — always on during play, glanceable, never interactive.**
Small, pinned to edges, low-contrast until relevant.
- Speed (bottom-center, tabular numerals — exists)
- Score/combo (pulses via token motion on trick land; during a gamemode this SAME slot
  becomes the mode HUD: timer + checkpoint count. A mode never adds a new screen region.)
- Minimap: small, top-right. Hold M to enlarge as a temporary overlay; in race mode it
  becomes the checkpoint strip in the same position.
- Presence chip (top-right, only in multiplayer): connection dot + pup count. Hold Tab
  for the roster overlay (FPS-scoreboard pattern). The multiplayer PANEL is deleted.

**2. Transient layer — appears on event, self-dismisses. One toast rail (reuse the
reskin's toast component), bottom-right, max 3 stacked, queue beyond that.**
- Trick results, room join/leave, duplicate-refund notices, update notice
- Agent-harness extension: `needs_input` = toast + bark (its session chip appears next
  to presence only while sessions are active; otherwise the extension renders nothing)
- Toasts NEVER cover the ambient HUD slots.

**3. Intent layer — summoned by the player, ONE view at a time, world dims behind
(same overlay language as pause/confirm), Esc returns to play.**
Reached via: main-menu items, the ☰ button, hotkeys.
- **Shop / Cosmetics (C)** — crate reveal center-stage, catalog as a rarity-organized
  grid, balance in the view header. Equipping previews LIVE on the dog visible in the
  dimmed world behind the view — the game is the fitting room.
- **Rooms / Lobby (R)** — room list is the primary content (join = one click),
  create-form secondary. Gamemode selection lives here for multiplayer; a "Modes" main
  menu item starts solo race/parkour.
- **Settings (T)** — player settings + the tuning sliders, keeping the Apply →
  confirm → auto-revert flow. The raw Live Tuning dev panel is gated behind `?dev=1`
  and invisible to players.
- **Controls (?)** — the legend leaves the permanent panel: shown once for first-time
  players (dismiss persists, like the main menu), afterwards behind ? or Settings.

**Chat** (multiplayer only): not a panel. A single collapsed line bottom-left showing
the last message, fading after ~6s. Enter focuses the input, Esc closes. Chrome-free.

## State model

MAIN MENU → PLAY ⇄ one INTENT VIEW at a time; Esc pops exactly one layer; PAUSE (Esc
from play) freezes solo physics, never the network. Views dim but do not stop the world
(multiplayer keeps simulating). Nothing auto-opens a view.

## Return readability (the agent-gaming identity)

Players alt-tab constantly to answer their agents. On return: state exactly as left, no
view auto-opened, missed toasts queued (max 3 shown) — the screen must be readable in
under a second.

## Typography inside views

Main-menu grade: eyebrow label, display-weight header, generous spacing, ONE primary
action per view; rows separated by space and hairlines, never boxes nested in boxes.

## Done when

Free-skate play shows exactly: speed, score, small minimap (+presence chip and collapsed
chat in multiplayer). Every other element reachable in ≤2 inputs as a focused view.
Hold-Tab roster and hold-M map work. First-run legend shows once. `?dev=1` gates the raw
tuning panel. Browser screenshots of play / shop / rooms / settings / multiplayer-play
approved against this doc; gate + smoke green.

## Resolution

landed 20e55ea (d17248e+0b84236+0ef73ab): intent-view controller with hotkey routing,
HUD-only play, focused Shop/Rooms/Settings views, presence/roster, chrome-free chat,
first-run legend, ?dev=1 gate. 177 tests + smoke green; orchestrator browser-approved
play/shop/rooms/settings screenshots against this spec (zero console errors).
