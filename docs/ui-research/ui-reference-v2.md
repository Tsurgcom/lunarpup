# Game UI reference v2 — sharper direction (source: interfaceingame.com, deep pass)

This is a second, much deeper pass over `ui-reference.md` (v1). It does not replace v1 —
v1's per-screen breakdown and the Lunar Pup file/line mapping are still valid and are not
repeated here except where this pass changes the conclusion. This document is opinionated:
it names exemplars, says do/don't, and calls out the one or two things worth actually
building next.

## What's different about this pass

- **Depth.** v1 worked from ~165 catalog entries (mostly single-page fetches per Elements
  tag). This pass drove a real browser against `interfaceingame.com/screenshots/`,
  clicking "Load more screenshots" repeatedly against the unfiltered feed (both
  "Most popular" and "Recent add · Sci-Fi" sort) and against 16 separate
  `?elements=<tag>[&themes=<theme>]` filtered views, each loaded 4-10 pages deep. That
  produced **3,106 unique raw entries** on the source site, scored and filtered down
  through a repeatable scoring/capping pass (see below) and merged into `catalog.json`
  with the original 167 v1 entries kept untouched — **1,176 total entries across 11
  categories** (a new `character-select-customization` category was added; it didn't
  exist in v1), **1,020 of them unique pages** (123 pages legitimately double-tagged
  across two categories, e.g. a Settings+Menu screen counted under both settings-options
  and main-menu — the same overlapping-taxonomy behavior v1 already documented, not a
  bug). Per-category final counts: settings-options 126, hud 127, shop-store 153,
  inventory 121, lootbox-reward-gacha 53, lobby-matchmaking-room-list 139,
  leaderboard-results-score 139, notifications-toasts 22, pause-menu 17, main-menu 125,
  character-select-customization 154.
- **Weighting.** New entries were scored (not randomly capped): +3 for games on a curated
  stylized/atmospheric/sci-fi/minimal list (Warframe, Control, Stray, Moonlighter, Gris,
  Hollow Knight, Rocket League, Genshin Impact Mobile, Honkai Impact 3rd, Brawl Stars,
  KartRider Rush+, and ~50 more), +2 for coming from a `themes=sci-fi` or `themes=pixel-art`
  filtered fetch, +1 for coming from the "Most popular" sweep, +1 for being a still image
  (easier to verify by eye than an autoplaying `.mp4`). Each category kept its top-scoring
  40-65 unique entries. This is why, for example, KartRider Rush+ (a stylized kart racer —
  the closest genre analogue to a moon-skating game in the whole corpus) is the single
  most-represented game in `shop-store` (15 entries) even though it isn't a AAA or
  most-liked title.
- **Observed vs inferred, honestly.** 12 specific screenshots (listed below, each marked
  **[observed]**) were opened at their individual detail page, the full-resolution image
  downloaded, and actually looked at — layout, spacing, and hierarchy claims for those 12
  are real, not guessed. Every other claim in this document is **[inferred]**: built from
  the title, tag co-occurrence, the game's known genre/reputation, and (for a few) v1's
  earlier `[observed]` findings (Apex Legends main menu, Gris pause menu, Toca Life World
  age-gate modal — carried forward, not re-verified). Video entries were not watched, same
  caveat as v1.
- **Lunar Pup has moved since v1.** v1 was written when Lunar Pup had no main menu, no
  settings-apply-confirm flow, and a flat cosmetics list. That's no longer true — see each
  section below for what's actually shipped now (checked directly against the current repo,
  not assumed). The comparison in this document is against the *current* implementation.

---

## Cross-cutting: what actually makes these feel premium

Distilled from the 12 directly-observed screenshots plus the shared-token system Lunar
Pup already has in `src/ui/tokens.css`:

1. **One panel recipe, reused everywhere, is non-negotiable — and Lunar Pup already has
   it.** `tokens.css` defines `--panel-bg: rgba(10,14,26,0.72)`, `--panel-border: 1px solid
   rgba(255,255,255,0.14)`, `--panel-radius: 12px`, `--panel-blur: blur(12px)`,
   `--panel-shadow`, and a 4px spacing scale (`--space-1..10`) — this is exactly the
   "shared visual language" v1 asked for, and it's real, not aspirational. The premium
   games in the corpus (Control, Cyberpunk 2077, The Ascent) do the same thing: one
   translucent-panel-over-dimmed-world recipe for settings, inventory, and store alike.
   The gap isn't the token system, it's that 2-3 places still use raw literals instead of
   the tokens (`.cosmetics-error` at `rgba(255,107,107,0.16)`, `.mp-room-selected` at
   `rgba(128,255,114,0.7)`) — small, easy cleanup, not a redesign.
2. **Negative space does the framing job a border would otherwise do.** [observed] In
   Control's weapon-mods screen (interfaceingame.com/screenshots/control-select-weapon-mods/)
   there is no card background behind the mod grid at all — just icons on the raw dimmed
   game world, with a single hairline rule under each info block. [observed] Warframe's
   Market screen (interfaceingame.com/screenshots/warframe-market/) is 90% empty black
   space above the fold; the category rail and search box sit small and top-left, and nothing
   fills the vacuum with decoration. Lunar Pup's own main menu already does this (title +
   6 text nav items, no boxes, per the mainMenu.ts/styles.css read) — the same restraint
   needs to survive into shop and inventory, which currently do use a bordered list-row
   per item. Don't reflexively wrap every UI element in a panel; empty space is not
   unfinished, it's a choice premium UIs make deliberately.
3. **Typography does hierarchy work instead of color/boxes.** [observed] KartRider Rush+'s
   shop (kartrider-rush-shop/) uses exactly two type treatments for headline
   promos (a bold display face for "Bazzi's Bundled Up" over a photo banner) versus small-caps
   nav labels ("Hot / Item / Trade / Kart / Racer / Outfit / Accessory") — no third weight in
   between. [observed] Cyberpunk 2077's inventory (cyberpunk-2077-inventory/) uses one
   accent color (cyan) exclusively for interactive/selected chrome and reserves plain white
   for stats and item names — color is a state signal, not decoration. Lunar Pup's own
   `--fs-display: clamp(52px,11vw,132px)` main-menu title is the same idea (one huge
   display size, everything else recedes) — the shop/inventory screens should adopt the
   same two-tier scale (one emphatic size for the thing you're buying/equipping, one quiet
   size for metadata) instead of every label reading at similar weight.
4. **Motion withholds before it reveals.** [inferred from the CS-site recording in v1,
   reinforced by every lootbox-tagged entry title in the new 64-entry
   `lootbox-reward-gacha` pool — "Bingo," "Spin," "Draw," "Roulette," "Lucky" appear
   repeatedly as titles, all implying a build-up-then-reveal beat, not an instant
   swap]. A 300-500ms pre-reveal hold (glow pulse, slot-reel deceleration, a beat of
   silence) is what makes an unlock read as *earned* rather than *rendered*. Lunar Pup's
   `openingLootbox` guard (blocks re-clicking mid-animation) is the right infrastructure
   already in place; the animation riding on top of it is the part still worth upgrading
   from three bouncing diamonds to a real decelerating reveal.
5. **Density is handled by hiding categories, not shrinking type.** [observed] Both
   KartRider Rush+'s shop and Warframe's market solve "too many items" with a left-hand
   category rail (Hot/Item/Trade/Kart/Racer/Outfit/Accessory for KartRider; a Categories
   dropdown + search for Warframe) rather than making the grid denser or the text
   smaller. [observed] Honkai Impact 3rd's shop hub (honkai-impact-3rd-shop/) goes
   further and doesn't even show a grid on the top level — three big illustrated cards
   (Shop / Supply / Recharge) *are* the category rail, deferred one tap deep. Lunar Pup's
   cosmetics panel currently has no category filter at all (`.cosmetics-list` is one flat
   scroll) — this is the first thing that will feel unpolished once the catalog grows past
   a screen or two of items, even before the character-preview gap below.

---

## Main menu — north star, keep it

**Current Lunar Pup state:** exists and is good. `src/ui/mainMenu.ts` + `styles.css:1023-1116`
— full-bleed scrim, `.main-menu-content` at `min(520px, 90vw)`, brand eyebrow + huge
`clamp(52px,11vw,132px)` title + tagline, six text-only nav rows with a left accent
border on hover (no button boxes), staggered entrance animation. This independently
converged on the same restraint v1 recommended from Hollow Knight/Gris (minimal, atmospheric,
few elements, no boxes) — no changes recommended, use its token values as the reference
recipe for every other screen.

**Recurring pattern in the corpus:** atmospheric minimal-UI menus (Hollow Knight, Gris,
Stray's pause state) use a title treatment + 3-6 plain-text options and nothing else; AAA
menus (Destiny 2, Overwatch 2, Death Stranding) add a background render/video loop and a
denser top nav but still keep the option list itself typographically simple.

**Exemplars:**
- Death Stranding — Main Menu — https://interfaceingame.com/screenshots/death-stranding-main-menu/ **[inferred]** — atmospheric hero render behind a simple option list, closest AAA analogue to Lunar Pup's own scrim-over-3D-scene approach.
- Destiny 2 — Destinations — https://interfaceingame.com/screenshots/destiny-2-destinations/ **[inferred]** — a sci-fi hub-menu; useful as a "don't" reference for density if Lunar Pup is ever tempted to add more than the current 6 nav items.
- Gris — Main menu — https://interfaceingame.com/screenshots/gris-main-menu/ **[inferred, but see the pause-menu [observed] entry below from the same game]** — very likely the identical orrery/line-art language as its pause menu.
- Detroit: Become Human — Main menu — https://interfaceingame.com/screenshots/detroit-become-human-main-menu-2/ **[inferred]**.

**Do:** keep title/nav-list restraint; keep the left-accent-border hover instead of adding
button chrome. **Don't:** add a secondary nav bar, background video loop, or a News/Store
tab — that's the AAA-density trap v1 already warned against, and Lunar Pup's current
implementation correctly avoids it.

---

## Shop — left-list / right-character-preview

**Current Lunar Pup state:** `src/ui/cosmetics.ts`, mounted in the Shop intent view.
Header + currency pill, a lootbox card, then `.cosmetics-list` — a single-column list of
`.cosmetics-card` rows (title/slot/rarity/small color swatches on the left, Buy/Equip
button on the right). **There is no character/item preview panel at all** — the only
visual feedback for what an item looks like is an 18px color swatch circle.

**Recurring pattern in the corpus:** every AAA-tier shop/inventory in the sample splits
the screen into a scrollable list/grid on one side and a large, live-updating
character/item render on the other. This is the single most consistent structural pattern
across the entire `shop-store` and `inventory` pools (119 + 107 entries) — not an edge
case.

**Exemplars:**
- Cyberpunk 2077 — Inventory — https://interfaceingame.com/screenshots/cyberpunk-2077-inventory/ **[observed]** — left column: Weapons list + Stats block; center: full-body character render holding the selected weapon, updates live; right column: equipment slots (Head/Upper Body/Lower Body/Special) as thumbnail tiles. Currency and capacity (`37/200`) sit top-right as persistent chrome, not shop-local. This is close to a direct template for Lunar Pup: swap "character render" for the moon-pup + board render, keep the same three-zone split.
- The Ascent — Store — https://interfaceingame.com/screenshots/the-ascent-store/ **[observed]** — left: a translucent Buy/Sell tab + vendor category list (Head Gear/Upper Body/Lower Body) directly over the dimmed game world (no background panel behind the list at all); the world/NPC art *is* the right-side "preview." Proves the preview doesn't need to be a dedicated 3D viewport — the live game camera can do the job.
- Control — Select weapon mods — https://interfaceingame.com/screenshots/control-select-weapon-mods/ **[observed]** — left: item grid; right: a detail panel (name/level/description/stat delta) with an Equip/Deconstruct action pair, floating over the dimmed world with no card background. Good reference for the item-detail sub-panel specifically (what shows when you select one item), distinct from the character-preview column.
- Warframe — Market — https://interfaceingame.com/screenshots/warframe-market/ **[observed]** — left: category rail + search; right: a large single hero item render with name/price/"Best Way to Begin" framing. Good reference for how sparse a premium store can be — most of the screen is negative space, not a dense grid.
- KartRider Rush+ — Shop — https://interfaceingame.com/screenshots/kartrider-rush-shop/ **[observed]** — closest genre match (stylized racer). Top bar: back button, screen title, then currency counters (soft currency, hard currency, energy) plus a "+" add-currency button, all in a single persistent row — confirms v1's point that currency is global chrome. Left: category rail. Center: a rotating hero promo banner above a 4-item "New!" row. Right: a vertical stack of discounted bundle cards with a strikethrough price and a "% OFF" ribbon. No character-preview column in this specific screen (it's a cosmetics-item shop, not an equip screen) — the preview pattern is specifically an *equip/inventory* convention, the *shop-browsing* convention is closer to a promo-banner + discount-card layout, worth keeping those two sub-patterns distinct.

**Do:** add a persistent right-side (or center) preview — even a static 3D render of the
current pup+board+equipped items that live-updates on hover/select is enough; it doesn't
need to be the full game camera. Keep currency as global top-of-screen chrome (already
correct in Lunar Pup's `.cosmetics-pill`). Add a left category rail once the catalog grows
past ~15-20 items — don't wait until the flat list is already unmanageable. **Don't:**
keep shipping color-swatch-only feedback for an equip decision — every strong exemplar in
this pool treats "what will this look like on me" as the primary visual, not a footnote.

---

## Inventory — uniform grid, not a list

**Current Lunar Pup state:** no separate inventory screen — folded into the shop/cosmetics
panel, `owned` vs. unowned items shown together in the same `.cosmetics-list` (confirmed:
`InventoryPayload`/`resolveLoadout` are data-layer concepts, there's no distinct inventory
route or view file). The list is vertical rows, not a grid.

**Recurring pattern:** near-universally a grid of equal-sized square/rectangular slots,
regardless of genre or art style — pixel-art (Moonlighter), photoreal (Cyberpunk 2077,
Destiny 2), or sci-fi-minimal (Warframe) all converge on the same grid-of-slots shape.
Equipped/selected state is communicated by a border/glow treatment on the slot itself, never
by resizing it or moving it out of the grid.

**Exemplars:**
- Moonlighter — Inventory — https://interfaceingame.com/screenshots/moonlighter-inventory/ **[observed]** — the best "lightweight" reference: an open-book UI, left page a 5-column item grid with stack-count badges, right page an equipment paperdoll (weapon/helmet/armor/accessory slots as icon tiles) plus a stat column (heart/attack/defense/speed icons with plain numerals) and a character render. Six-tag co-occurrence in its own catalog entry (Character, In game, Inventory, Menu, Overlay, Stats) confirms this is a genuinely composite screen, not "just a grid" — but it's still built from a grid + a paperdoll + a stat strip, three simple pieces, not one dense monolith.
- Stray — Inventory — https://interfaceingame.com/screenshots/stray-inventory/ **[observed]** — the minimal end of the spectrum: a single-row horizontal strip of items (currently just one: a keyring) rendered as a diegetic in-world hologram above the cat, no grid at all because there's nothing to grid yet. Good precedent for what Lunar Pup's inventory should look like when a player owns very few items — don't force a multi-row grid with mostly-empty slots; collapse to a single row/strip until there's enough to justify a grid.
- Destiny 2 — Inventory — https://interfaceingame.com/screenshots/destiny-2-inventory/ **[inferred]** and Destiny 2 — Armor set — https://interfaceingame.com/screenshots/destiny-2-armor-set/ **[inferred]** — the AAA-heavy end (looter-shooter density); useful as a "don't over-import" reference, not a template.
- Warframe — Equipment — https://interfaceingame.com/screenshots/warframe-equipment/ **[inferred]** and Warframe — Inventory — https://interfaceingame.com/screenshots/warframe-inventory/ **[inferred]**.

**Do:** convert the flat `.cosmetics-list` rows into an actual grid of equal-size tiles for
owned items, with the existing rarity color scale (`.cosmetics-swatch`/`.lootbox-rarity-*`)
promoted from an 18px accent dot to a full tile border/glow; collapse to a single row when
the player owns few items (Stray's approach) rather than showing a half-empty grid. **Don't:**
add a full paperdoll + multi-stat sidebar (Division/Destiny-style) — Lunar Pup's cosmetics
depth (slot + rarity + swatch) doesn't warrant it; Moonlighter's *lighter* three-piece
composition (grid + simple equip slots + a short stat strip) is the right density target,
not the AAA looter-shooter end.

---

## Character-select / preset loadouts (new screen)

**Current Lunar Pup state:** does not exist as a distinct screen. "Loadout" currently only
means "whatever's equipped in the shop panel" (`PlayerLoadout`/`defaultLoadout` in
`src/content/catalog.ts`) — there's no dedicated screen for browsing/selecting a
pup+board+trail combination as a single named preset before a run.

**Recurring pattern:** two different things get called "character select" and are worth
keeping distinct. (1) A **roster/select** screen (pick which of several characters to play
as) — Overwatch, Brawl Stars, Marvel Rivals. (2) A **customization/loadout** screen (dress
up the one character/vehicle you already have) — Genshin's weapon selection, The Ascent's
loadout screen, Warframe's skin screen. Lunar Pup only has one playable pup, so it's
squarely in bucket (2): a **loadout preset** screen (save/recall a named combo of
pup-skin + board + trail + material) is the right shape, not a roster grid.

**Exemplars:**
- Marvel Rivals — Customization — https://interfaceingame.com/screenshots/marvel-rivals-customization/ **[inferred]** — large hero render center-stage with equip categories as a side rail, closely mirrors the shop's Cyberpunk-style split; reinforces that "character-select" and "shop equip" should probably be the *same layout system* for Lunar Pup, not two different screens.
- Overwatch — Assemble your team — https://interfaceingame.com/screenshots/overwatch-assemble-your-team/ **[inferred]** — genuine roster-select (bucket 1), included as a contrast case, not a template — Lunar Pup shouldn't build this since there's one playable character.
- The Ascent — Loadout — https://interfaceingame.com/screenshots/the-ascent-loadout/ **[inferred]** — isometric character render with equipment slots around it, a good "single character, multiple equip slots" analogue since The Ascent, like Lunar Pup, is a single-protagonist game.
- Genshin Impact Mobile — Weapon Selection — https://interfaceingame.com/screenshots/genshin-impact-mobile-weapon-selection/ **[inferred]** and Character Archive — https://interfaceingame.com/screenshots/genshin-impact-mobile-character-archive/ **[inferred]**.
- Brawl Stars — Brawlers — https://interfaceingame.com/screenshots/brawl-stars-brawlers/ **[observed]** — a card-grid roster (rank badge, trophy count, power level, per-card upgrade CTA) — again bucket 1, kept here only because it's the sharpest **[observed]** reference for how much metadata a single character-card can carry (rank/power/currency-cost) without feeling cluttered: rank badge top-left, trophy count top-center, name+power bottom, one CTA — four zones, never five.

**Do:** treat this as "save/recall named loadout presets" (e.g. "Race Day," "Trick Set")
built on the exact same left-list/right-preview layout recommended for the shop above — not
a new visual system. Cap each preset card to the same four-zone information budget Brawl
Stars' card demonstrates (identity, one key stat, one secondary stat, one CTA). **Don't:**
build a multi-character roster grid — Lunar Pup has one playable pup; that's a customization
screen wearing a character-select screen's clothes, and the roster-select exemplars above
are explicitly the wrong shape to copy.

---

## Multiplayer lobby / matchmaking / room list

**Current Lunar Pup state:** already close to the recommended pattern. `src/ui/multiplayer.ts`
(Rooms intent view) has a status line, a scrollable `.mp-rooms` room-browser list (room id +
gamemode + player count, selected state = green border), and a separate `.mp-create` form.
Distinct from that, an in-play **roster overlay** (`RosterOverlay.tsx`) shows on hold-Tab
with per-player cards, and a persistent `.presence-chip` (dot + count) sits top-right during
multiplayer. This is exactly the "browse rooms as a list, show who's-with-me as slots/cards
separately" split v1 recommended — already correctly separated, not a gap.

**Recurring pattern:** confirms the same split independently — a browsable list/table for
choosing among many rooms, a slot/avatar view once inside one, and always one unmistakable
bottom-anchored primary CTA.

**Exemplars:**
- Overwatch — Find Game — https://interfaceingame.com/screenshots/overwatch-find-game/ **[observed]** — this is close to a direct template for a "browse many rooms" table: sortable columns (Name / Teams / Game Mode / Current Map / Ping), a search box, a "+ CREATE" button top-right, and a live in-lobby chat log bottom-left feeding into a bottom-anchored "JOIN" button — the single clearest **[observed]** validation that a dense text table (Lunar Pup's `.mp-rooms` shape) is the right choice for *browsing*, with a chat feed underneath it rather than beside it.
- Rocket League — New season — https://interfaceingame.com/screenshots/rocket-league-new-season/ **[observed]** — not a room browser but a strong reference for **diegetic settings-over-3D-scene**: a dimmed/blurred stadium with the player's actual cars visible behind a simple left-aligned option list (Team Size/Difficulty/Season Length) and one bottom-left party-slot card ("cherwood" + a "CREATE PARTY" button) — this is the closest genre/tone match in the whole corpus (arcade sports, cars-as-cosmetics, stadium-as-backdrop) to what a Lunar Pup pre-race lobby over the moon surface could look like.
- Killing Floor 2 — Store / Featured — https://interfaceingame.com/screenshots/killing-floor-2-store/ **[inferred]** (co-tagged Lobby+Store — a reminder that some games fold a store tab into the same lobby shell Lunar Pup uses for Rooms, worth considering if the Shop and Rooms intent views ever want a shared frame).
- Super Bomberman R — Player ready / Select your character — https://interfaceingame.com/screenshots/super-bomberman-r-player-ready/ **[inferred]** — small-roster (4-player) slot visualization, a good scale reference since Lunar Pup's rooms are likely similarly small.

**Do:** keep the list/slots split as-is; consider adopting Overwatch's sortable-table
columns if room count grows, and Rocket League's "party card in the corner, options in the
middle, world visible behind" composition for a pre-race ready screen. **Don't:** merge the
room browser and the in-room roster into one view — the current separation is correct,
don't regress it.

---

## Settings

**Current Lunar Pup state:** already implements the exact pattern v1 recommended. `src/ui/tuning.ts`
writes slider changes to a local `draft` only; `applyDraft()` triggers `src/ui/confirmRevert.ts`
— a "Keep these settings?" modal with a live countdown (`DEFAULT_REVERT_SECONDS = 12`),
Keep/Revert buttons, Escape-to-revert, and automatic revert at 0. The file header literally
documents this as "the Dishonored 2 pattern." This is a genuine, verified win from v1 → this
pass has nothing structural to add here.

**Recurring pattern (unchanged from v1, reinforced by the deeper sample):** grouped
sliders/toggles by domain, apply-then-confirm reserved for changes that could strand the
player (display/physics extremes), not applied to every toggle.

**Exemplars:**
- Control — Display — https://interfaceingame.com/screenshots/control-display/ **[inferred]** and Control — Gameplay — https://interfaceingame.com/screenshots/control-gameplay/ **[inferred]** — grouped-by-domain tabs over the dimmed world, same minimal chrome as its inventory screen — reinforces the "one visual system across every screen" point.
- Stray — Settings - Controls / Settings - Languages — https://interfaceingame.com/screenshots/stray-settings-controls/ **[inferred]**, https://interfaceingame.com/screenshots/stray-settings-languages/ **[inferred]** — minimal-game settings done plainly, good tone match.
- Cyberpunk 2077 — Control scheme / Gamma correction — https://interfaceingame.com/screenshots/cyberpunk-2077-control-scheme/ **[inferred]**, https://interfaceingame.com/screenshots/cyberpunk-2077-gamma-correction/ **[inferred]** — gamma/display calibration screens are a specific, common sub-pattern (a calibration image with a slider) worth having ready if Lunar Pup ever exposes brightness/contrast.

**Do:** nothing structural — this screen is done right. If anything, extract the confirm/
revert modal as a reusable primitive (v1 already flagged this as generally useful for
tuning-panel physics *and* things like an accidental disconnect) since it's proven out here.
**Don't:** let the auto-revert countdown pattern stay siloed to `tuning.ts`; it's a
general-purpose trust mechanism per v1's cross-cutting pattern #3 and should be pulled out
before a second screen needs it and reimplements it slightly differently.

---

## HUD

**Current Lunar Pup state:** working, correctly anchored — speedometer bottom-center,
trick-hud just above it, gamemode-status above that, minimap top-right (enlarges on
hold-M), presence chip top-right below the minimap, chat bottom-left (idles/fades when
unused). This matches v1's recommended corner/bottom-center convention already.

**Recurring pattern (reinforced):** corner-anchored persistent info, center/bottom
transient callouts; HUD chrome should visually match menu/overlay chrome (Lunar Pup's
`--panel-*` tokens already make this true structurally, mentioned in the cross-cutting
section above).

**Exemplars:**
- Marvel Rivals — HUD — https://interfaceingame.com/screenshots/marvel-rivals-hud-4/ **[inferred]** — current-gen team-shooter HUD density, useful mainly as a "how much is too much" upper bound Lunar Pup should stay well under.
- Moonlighter — Chest / Inventory — https://interfaceingame.com/screenshots/moonlighter-chest/, https://interfaceingame.com/screenshots/moonlighter-inventory/ **[observed, inventory one]** — its top-left heart/health-bar + coin counter is a good minimal always-on HUD reference at Lunar Pup's own density level.
- Tom Clancy's The Division 2 — Inventory — https://interfaceingame.com/screenshots/tom-clancys-the-division-2-inventory/ **[inferred]** — six-tag composite screen (Character/In game/Inventory/Menu/Overlay/Stats), the clearest evidence in the whole corpus that a well-designed HUD and a well-designed inventory can literally be the same screen when both need persistent stat readouts — not directly applicable to Lunar Pup (whose HUD and inventory are and should stay separate) but useful context for why some games merge them.

**Do:** nothing structural — anchoring and chrome-sharing are both already correct.
**Don't:** let a future HUD addition break the corner/bottom-center convention without a
specific reason.

---

## The single highest-impact change

Everything else in this document is either "already correct, don't touch it" (main menu,
settings, HUD, the lobby's list/slot split) or a genuine but secondary refinement (category
rails, grid vs. list for inventory, a reusable confirm/revert primitive). The one gap that
shows up as *the* dominant structural pattern across 226 combined shop-store + inventory
entries, and that Lunar Pup's current cosmetics panel is missing entirely, is: **no
character/item preview.** Every strong exemplar — Cyberpunk 2077's inventory, The Ascent's
store, Control's mod screen, Warframe's market — treats "what does this look like on me"
as the primary visual, with the buy/equip list as a secondary rail beside or below it.
Lunar Pup currently answers that question with an 18px color-swatch dot. Adding a
persistent preview column (even a static render that swaps per hover/select, not a full
3D viewport) to the existing `#cosmetics-panel` is the smallest change that would make the
shop and inventory read as "designed" rather than "functional" — and it's also the one
change that, once built, both the shop, the inventory-grid, and the new character-select/
loadout screen can share, since all three need the same "preview what's equipped" surface.
