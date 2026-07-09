STATUS: open
PRIORITY: P1
COMPLEXITY: high
TOUCHES: src/ui/, src/styles.css, index.html
BLOCKED_BY: —

## Goal

Lunar Pup's UI today is functionally solid (agent HUD, cosmetics shop with a working
lootbox flow, room browser, tuning panel, chat, minimap, trick score, mode
select/results) but visually fragmented: every panel in `src/styles.css` hand-repeats
its own `background: rgba(10, 10, 25, 0.72); border: 1px solid rgba(255,255,255,0.14);
border-radius: 10px; box-shadow: 0 8px 30px rgba(0,0,0,0.3);` recipe instead of sharing
one, three different rarity/status color conventions exist across cosmetics/lootbox/
agent-hud, and two whole screens (main menu, pause menu) don't exist yet at all.

The goal is a cohesive, diegetic sci-fi UI system for a moon-skating game:

- A shared token layer (panel chrome, typography scale, blur/radius/shadow, motion
  timing/easing, one rarity/status color scale) that every `src/ui/*.ts` panel and
  `src/styles.css` block draws from, instead of each panel inventing its own.
- A real settings save/apply flow: explicit Apply action, then a confirm modal with a
  visible auto-revert countdown, modeled directly on the Dishonored 2 exemplar
  (https://interfaceingame.com/screenshots/dishonored-2-apply-settings/) — apply a
  change, show "Keep these settings?" with a countdown, revert automatically if
  unconfirmed. Lunar Pup's `tuning-panel` (`src/ui/tuning.ts`) currently applies every
  slider change live with only Reset/Copy — no Apply, no confirm, no revert — this is
  the single biggest concrete gap the research surfaced.
- A unified HUD layout: keep the existing correct parts (corner-anchored persistent
  elements, center-bottom transient callouts, monospace score readouts — trick-hud and
  speedometer already do this right) and bring every other panel onto the same visual
  footing rather than rewriting what already works.
- The two missing screens (main menu, pause menu), built diegetically rather than as
  generic dark rectangles. The research's strongest, most directly transferable single
  finding: Gris's pause menu (observed still image, not inferred) renders as pure line
  art — thin white concentric orbit rings on black, menu items sitting directly on the
  rings, a filled dot per "planet," zero panel chrome. That is an unusually good literal
  fit for a moon/orbit game and should be the starting concept for Lunar Pup's pause
  menu, not a bordered list box.

## Key patterns from the reference doc

Full detail, exemplar URLs, and per-category do/don't guidance live in
`docs/ui-research/ui-reference.md` (see also the raw catalog in
`docs/ui-research/catalog.json`). The load-bearing patterns for implementation:

1. **Shared visual language across every screen.** The source catalog's own tagging
   (screens routinely carrying both Menu+Settings, Menu+Store, Overlay+Scoreboard tags)
   is itself evidence that well-executed game UI doesn't context-switch its visual
   system per screen — one panel recipe, one type scale, one rarity palette, reused
   everywhere.
2. **Overlay-over-dimmed-world beats a page-cut for anything mid-session.** Settings
   confirm, lootbox reveal, and match results should all appear as modals/overlays on
   top of (or lightly masking) the live scene — `#gamemode-results` already does this
   correctly and is the reference implementation to copy the footing from.
3. **The confirm/auto-revert pattern generalizes beyond display settings** to any
   action that's easy to get wrong in a way that locks the user out — worth applying to
   tuning-panel physics extremes and possibly room-disconnect, not just to the literal
   settings screen.
4. **Toasts and blocking modals are different components** and Lunar Pup currently
   conflates them: `#update-notice` is styled/positioned like a toast (top-center,
   compact) but behaves like a persistent blocking notice (no auto-dismiss, no
   stacking support for a second concurrent message). The overhaul should build a real
   stacking toast system and keep the update banner as one deliberate non-dismissing
   instance of it, not the only notification mechanism the whole game has.
5. **Lootbox reveal: decelerating reel, not instant swap** (observed, from
   user-provided CS:GO/CS2 case-site captures — a catalog screenshot plus a 10.6s
   recording whose frames were extracted and inspected; see the lootbox section of the
   reference doc and the two `file://` entries in `catalog.json`). The observed loop:
   pre-spin glow beat on the case icon → vertical reel spin that *decelerates* onto the
   won item (~2-3s) → rarity-colored result card, with live-updating tabular value
   totals and a persistent drop-history grid below. Lunar Pup's current
   `.lootbox-animation` (three bouncing diamonds) should be replaced with this shape,
   and the observed catalog-card anatomy (art, name, price pill, odds meter on the card
   itself) applied to the Moon Crate card. The same captures also document what to
   deliberately *not* copy: FOMO rain pots with countdowns, real-currency framing, and
   social-pressure feeds — Lunar Pup's published-odds + duplicate-refund stance is the
   ethical inverse and stays.
6. **Room browsing vs. in-room roster are different views.** Keep `.mp-rooms` as a text
   list for browsing (that's the right shape for choosing among many rooms), but add a
   slot/avatar-based roster once a player is actually inside a room, plus one
   unmistakable bottom-anchored primary CTA — mirroring the Apex Legends lobby hub
   (observed still image: tab bar, persistent currency, center character, flanking
   add-player slots, bottom READY bar).

## Done-when

- A documented, shared set of CSS custom properties (or equivalent token module) for
  panel background/border/radius/blur/shadow, type scale, motion durations/easing, and
  one rarity/status color scale — consumed by every panel in `src/styles.css`, with the
  old per-panel hand-repeated recipes removed.
- `tuning-panel` (or its settings-relevant successor) has a real Apply action that opens
  a confirm modal with a visible countdown and auto-reverts on timeout, matching the
  Dishonored 2 exemplar's shape (not literally its visuals).
- A toast/notification component exists that supports auto-dismiss and stacking;
  `update-notice` is reimplemented on top of it as the one persistent exception rather
  than remaining a one-off div.
- A main menu screen exists (title treatment + 3-5 options, links to settings) using
  the shared token system, in the minimal/atmospheric register (Hollow Knight/Gris-like
  restraint), not an AAA-density menu.
- A pause menu screen exists, explicitly evaluated against the orbit-ring/orrery
  concept from the Gris exemplar before defaulting to a conventional panel-and-list
  treatment.
- Every existing panel (agent HUD, cosmetics/lootbox, room browser, minimap, chat,
  trick HUD, mode select/results) visually reads as one system — same chrome, same
  type scale, same rarity/status colors — verified by eye, not just by shared class
  names.
- Cosmetics/inventory/lootbox rarity colors are unified to one palette used in all
  three places (currently `.cosmetics-swatch` and `.lootbox-rarity-*` are separate,
  unlinked color decisions).
- The Moon Crate open flow uses a decelerating reel-spin reveal (pre-spin beat →
  decelerating reel → rarity-colored result) per the observed CS-site exemplar, with
  the open button disabled for the full reveal, a reduced-motion fallback, and no
  FOMO/pressure mechanics added.

## Note on execution

This is a research and distillation pass only — no UI code has been changed. Per the
model-routing guidance for this codebase, actually implementing this overhaul (the
token system, the settings confirm/revert flow, the two new screens, and the visual
unification pass) is taste-sensitive UI/UX work and should go to a high-taste model
(opus-4.8 or fable-5), not be executed directly from this research pass.
