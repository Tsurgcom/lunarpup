STATUS: open
PRIORITY: P1
COMPLEXITY: high
TOUCHES: src/r3f-shell/IntentViews + view components, src/ui/, src/game/cosmetics, styles
BLOCKED_BY: 13 (upstream refresh)

# 14 — Shop, character & multiplayer views v2 (user feedback round 2)

Direct user feedback on the landed intent-view redesign:

1. **Escape is broken on some UI screens** — audit every view/overlay: Esc must always
   pop exactly one layer (view → play, pause → play, main-menu sub-screen → main menu).
   Add a test per view.
2. **Sub-screens opened FROM the main menu must return TO the main menu** on Esc/back —
   not to gameplay. Views remember their origin (menu vs play) and pop back accordingly.
   Every view gets a visible back affordance, not just the Esc hint.
3. **Merge Rooms + Modes into one Multiplayer view**: the current two entries show the
   same UI. One view: room browser (join) as primary content, plus "spin up a room" with
   a gamemode selector in the same view. Solo mode-start stays on the main menu as Play
   options or within the view marked as solo.
4. **Shop v2 — a real shop with live character preview**: layout is cosmetic LIST on the
   LEFT, CHARACTER on the RIGHT (the actual 3D dog, live-rendering the hovered/selected
   cosmetic before purchase). Selecting a cosmetic previews it instantly; buying/equipping
   confirms it. Keep rarity organization, balance chip, crate reveal.
5. **Character screen with preset loadouts**: let the player pick their character look;
   offer preset outfit combinations (curated bundles of board/body/trail/aura) plus the
   player's own saved loadout. Equipping a preset equips all owned pieces and offers to
   buy missing ones.
6. **Inventory screen**: all collected cosmetics in one place (grid, rarity-organized,
   equip from here; duplicates/refund history optional).

Implementation notes: the 3D preview should reuse the existing R3F scene rather than a
second canvas if feasible (frame the dog with a dedicated camera view while the shop is
open — the world is already dimmed behind the view). Preview must never mutate authoritative
equipped state until the player confirms. All new views obey the intent-layer rules from
concern 12 (one at a time, menu-grade typography, reduced-motion).

## Done when

Esc works on every screen (tested); menu-opened views return to menu; one Multiplayer
view (browse + create with gamemode); shop shows list-left/character-right with live
preview; character screen with presets; inventory grid. Browser screenshots approved
against this doc; gate + smoke green.
