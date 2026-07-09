STATUS: open
PRIORITY: P1
COMPLEXITY: high
TOUCHES: src/r3f-shell/ panels, src/ui/, src/styles.css, tokens.css
BLOCKED_BY: 11 (react-port)

# 12 — Panel redesign: from seven boxes to one focused view

User verdict on the current build: "the main menu is beautiful, the rest of the panels
are ugly as shit." Correct. The menu commits — display type, negative space, one focal
point. The panels are seven co-equal dark slabs pinned to the screen edges
simultaneously (controls help, multiplayer+rooms, map, tuning, gamemodes, cosmetics,
chat), every element the same visual weight. That's an information-architecture failure,
not a styling one; restyling the boxes keeps the noise.

## Direction

1. **During play: HUD only.** Speedometer, score, small minimap, trick/notification
   toasts. Nothing else on screen. Controls help appears once for new players and as a
   toggle, not a permanent panel.
2. **Everything else is a focused view, one at a time**, summoned by intent: main-menu
   items, the ☰ button, and hotkeys (C shop, R rooms, T settings, Enter chat). A view
   takes real estate (right-side sheet or centered column over dimmed world — match the
   pause/confirm overlay language), and closes with Esc back to play.
3. **Bring the main menu's typography INTO the views.** Eyebrow label, display-weight
   header, generous spacing, ONE primary action per view. Kill boxes-inside-boxes: list
   rows separate with space and hairlines, not nested panel chrome.
4. **Shop becomes a real view** (not a corner column): crate reveal center-stage, catalog
   in a grid with rarity as the organizing visual, balance in the view header.
5. **Rooms becomes a lobby view**: room list as primary content, create-form secondary.
6. **Tuning lives under Settings** with the confirm/auto-revert flow intact.
7. Chat stays lightweight during play (collapsed input, expands on Enter).

Tokens, rarity system, reduced-motion, and the confirm/reel patterns all stay — this
concern re-homes them, it does not restyle them again.

## Done when

Playing shows HUD only; every panel is reachable in ≤2 inputs and renders as a single
focused view with menu-grade typography; browser screenshots of play/shop/rooms/settings
approved against this doc; gate + smoke green.
