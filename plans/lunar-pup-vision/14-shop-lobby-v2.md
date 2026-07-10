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

## Premium-feel direction (from docs/ui-research/ui-reference-v2.md — 1,176-entry corpus)

Three observed patterns that separate premium game UIs from ours; apply across every view:
1. **Negative space frames, not borders.** The best exemplars (Control weapon-mods,
   Warframe Market) drop card backgrounds entirely — icon + text float over the dimmed
   world, spacing does the grouping. Our intent views should lean on the dimmed backdrop
   and generous gaps, not nested panel chrome (reinforces concern-12's no-boxes-in-boxes).
2. **One token recipe everywhere** — already true via tokens.css; keep every new view on it.
3. **Two-tier typography**: one emphatic size + one quiet metadata size, not many
   similar-weight labels. Match the main-menu title treatment we already have.

**Highest-impact single change (research verdict):** the shop's only equip feedback today
is an 18px swatch dot. Every strong exemplar (Cyberpunk inventory, The Ascent store,
Control mods, Warframe market) makes "what does this look like on me" the PRIMARY visual.
This is exactly the list-left / character-right preview already specced above — treat the
live character preview as the shop's centerpiece, not an addition. The same preview render
is reused by the character-select/loadout screen.

## Motion & feel (from docs/ui-research/emilkowalski-skills-assessment.md)

Emil Kowalski's skills (MIT; author of Sonner/Vaul) — adopt as guidance, not a library.
Our tokens.css already matches most of his easing/duration philosophy. Confirmed gaps to
close in this pass:

- **Press feedback everywhere**: `.lp-button`, `.main-menu-item`, `.pause-item` (and all
  new interactive elements) have hover/focus but NO tactile `:active` state. Add
  `transform: scale(0.97)` (token-driven) on press — highest feel-per-line change in the
  game. Respect `prefers-reduced-motion`.
- Apply his interaction rules to the new shop/character/inventory controls: hover intent,
  focus-visible rings, and consistent transition timing from the motion tokens.
- Optionally copy the 4 MIT skill files into `.claude/skills/` (with LICENSE) for reuse —
  flagged for the operator, not done here.

## Done when

Esc works on every screen (tested); menu-opened views return to menu; one Multiplayer
view (browse + create with gamemode); shop shows list-left/character-right with live
preview; character screen with presets; inventory grid. Browser screenshots approved
against this doc; gate + smoke green.
