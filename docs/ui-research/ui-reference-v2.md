# Game UI reference v2 — sharper direction (source: interfaceingame.com, deep pass)

This is a second, much deeper pass over `ui-reference.md` (v1). It does not replace v1 —
v1's taxonomy-mapping and honesty notes are still valid and aren't repeated here except
where this pass changes the conclusion. This document is opinionated: it names exemplars,
says do/don't per screen, and closes on the one change worth building next.

## What's different about this pass

- **Depth.** v1 worked from 167 catalog entries, mostly one page per Elements tag. This
  pass (and a concurrent research pass folded into the same file) fetched the site's own
  paginated listing URLs directly (`/screenshots/page/N/?elements=<slug>` — the exact
  target of the site's "Load more screenshots" link, so this is equivalent to clicking it
  repeatedly but with one page load per fetch instead of extra client-side event churn)
  across the taxonomy tags relevant to our screens, several pages deep each, plus a new
  direct-match tag (`character`) that v1 didn't cover. After deduplication against v1's
  original 167 (kept untouched) and against each other, **`catalog.json` now holds 1,176
  entries across 254 distinct games** — up from 167. A new `character-select-customization`
  category was added since it's one of our seven target screens and the site has a direct
  tag for it. Per-category final counts: settings-options 126, hud 127, shop-store 153,
  inventory 121, lootbox-reward-gacha 53, lobby-matchmaking-room-list 139,
  leaderboard-results-score 139, notifications-toasts 22, pause-menu 17, main-menu 125,
  character-select-customization 154. A small fraction of entries (156 of 1,176) appear
  under more than one category — legitimate when a single screenshot genuinely serves two
  of our target screens (e.g. a screen tagged both Character and Store), not a dedup bug;
  there are zero duplicate entries *within* any single category.
- **Why some categories are thinner than others.** `lootbox-reward-gacha` (53) and
  `notifications-toasts` (22) have no dedicated tag on the site at all — they're built by
  keyword-matching titles inside other tags' pools, and once a screenshot is claimed by
  the category it best fits (a "reward" screen tagged `progress` usually reads more like
  a leaderboard/results screen than a lootbox), there's less left over than the raw
  keyword-match count suggests. `pause-menu` (17) needed the widest net: the
  `main-menu`/`start-screen` tags alone only ever surface Gris and Need for Speed Heat
  (the two v1 already knew about); the rest came from title-keyword search
  ("pause"/"paused") across the wider corpus, turning up a genuinely useful spread of
  2D/indie pause screens (Celeste, Stray, Octahedron, Sonic Mania, Minit) alongside a
  couple of AAA ones (Cyberpunk 2077, Mirror's Edge Catalyst). The site still doesn't tag
  pause screens as their own taxonomy value, flagged in v1 and still true — it just took
  a broader search than the direct tags to find them.
- **Observed vs inferred, honestly.** 20 specific screenshots (listed below, each marked
  **[observed]**) were opened at their individual detail page and actually looked at, via
  the site's own lightbox (which renders the source image full-size with its title/tag
  chrome beneath it) — layout, spacing, and hierarchy claims for those 20 are real, not
  guessed, and every one of the pageUrls cited is present in the current `catalog.json`.
  Every other exemplar in this document is **[inferred]**: built from the title, tag
  co-occurrence, and the game's known genre/reputation, same honesty bar as v1. Video
  entries were not watched, same caveat as v1.
- **Lunar Pup has moved since v1 was likely first drafted.** The current repo already has
  a real main menu, a working settings-apply-confirm flow, and a token system — this
  document checks each section against the *current* implementation (file paths, actual
  CSS values, verified directly against the repo) rather than assuming a blank slate.

---

## Cross-cutting: what actually makes these feel premium

Distilled from the 20 directly-observed screenshots, cross-checked against the shared
token system Lunar Pup already has in `src/ui/tokens.css`:

1. **One panel recipe, reused everywhere, is non-negotiable — and Lunar Pup already has
   most of it.** `tokens.css` defines `--panel-bg`, `--panel-radius: 12px`,
   `--panel-blur: blur(12px)`, a `--panel-shadow`, a `--panel-border` (indirected through
   `--panel-border-color: rgba(255,255,255,0.14)`), and a spacing scale — though it's not
   a clean 1-through-10 run, `--space-7` and `--space-9` simply don't exist, only
   1/2/3/4/5/6/8/10 are defined. The premium exemplars in this corpus (Control, Cyberpunk
   2077, The Ascent) all do the same thing: one translucent-panel-over-dimmed-world recipe
   reused for settings, inventory, and store alike, not a bespoke chrome per screen. The
   gap isn't the token system, it's that a couple of screens still reach for raw literals
   instead of it — `.cosmetics-error` uses `rgba(255,107,107,0.16)` and `.mp-room-selected`
   uses `rgba(128,255,114,0.7)` directly (both verified in `styles.css`) rather than a
   named color token. Small, easy cleanup, not a redesign.
2. **Negative space does the framing job a border would otherwise do.** [observed] In
   Control's weapon-mods screen (`control-select-weapon-mods/`) there's no card
   background behind the mod grid at all — just icons on the raw dimmed game world, one
   hairline rule under each info block. [observed] Warframe's Market screen
   (`warframe-market/`) is roughly two-thirds empty space above the fold — a faint
   floating title ("WARFRAME®: STARTER BUNDLE / THE BEST WAY TO BEGIN") sits alone in a
   dark expanse, with a small Categories dropdown + search box tucked top-left and the
   actual item cards compressed into one row along the bottom edge; nothing fills the
   vacuum with decoration. Lunar Pup's own main menu already does this (title + six text
   nav items, no boxes, per `mainMenu.ts`/`styles.css:1021-1116`) — the same restraint
   needs to survive into shop and inventory, which currently render every item as a
   bordered list row. Don't reflexively wrap every element in a panel; empty space is a
   choice premium UIs make deliberately, not unfinished work.
3. **Typography does hierarchy work instead of color or boxes.** [observed] KartRider
   Rush+'s shop (`kartrider-rush-shop/`) uses exactly two type treatments across the whole
   screen: one bold display face for the "Bazzi's Bundled Up" promo headline, one small
   label weight for everything else (category rail, item names, currency counters) — no
   third weight in between. [observed] Cyberpunk 2077's inventory (`cyberpunk-2077-inventory/`)
   uses a single cyan accent reserved exclusively for interactive/selected chrome
   (tab highlight, category label, quickslot outline) and plain white for every stat and
   item name — color signals state, it doesn't decorate. Lunar Pup's own
   `--fs-display: clamp(52px, 11vw, 132px)` main-menu title is the same idea already (one
   huge display size, everything else recedes); shop and inventory should adopt the same
   two-tier scale instead of every label reading at similar weight.
4. **Motion withholds before it reveals.** Every lootbox-tagged entry title in the
   53-screenshot-wide keyword sweep behind `lootbox-reward-gacha` skews toward "Bingo,"
   "Spin," "Draw," "Roulette," "Lucky" — titles that all imply a build-up-then-reveal beat,
   not an instant swap **[inferred from title patterns, not a watched video]**. A
   300-500ms pre-reveal hold (a glow pulse, a slot-reel deceleration, a beat of near-
   silence) is what makes an unlock read as *earned* rather than *rendered*. Lunar Pup's
   loot-opening guard (blocking re-clicks mid-animation) is the right infrastructure
   already in place; the animation riding on top of it is the part worth upgrading toward
   a real decelerating reveal rather than a flat pop-in.
5. **Density is handled by hiding categories, not shrinking type.** [observed] Both
   KartRider Rush+'s shop and Warframe's market solve "too many items" with a left-hand
   category rail (Hot/Item/Trade/Kart/Racer/Outfit/Accessory for KartRider; a Categories
   dropdown + search for Warframe) rather than making the grid denser or the text smaller.
   Lunar Pup's cosmetics panel currently has no category filter at all — one flat
   `.cosmetics-list` scroll — which is the first thing that will feel unpolished once the
   catalog grows past a screen or two of items, ahead of the character-preview gap below.

---

## Main menu — the north star

**Current Lunar Pup state:** exists and is already good. `src/ui/mainMenu.ts` +
`styles.css:1021-1116` — an absolutely-positioned scrim within the menu overlay,
`.main-menu-content` capped at `min(520px, 90vw)`, a brand eyebrow, a title set at
`var(--fs-display)` (`clamp(52px, 11vw, 132px)`), a tagline, six plain-text nav rows using
a left accent-color border on hover instead of button chrome, and a staggered `--i`-indexed
entrance animation. This independently converged on the same restraint the corpus argues
for (minimal, atmospheric, few elements, no boxes) — treat its token values as the
reference recipe for every other screen, not just this one.

**Recurring pattern:** atmospheric minimal menus (Hollow Knight, Gris, Control's start
screen) use a title treatment plus 3-6 plain-text options and nothing else; AAA menus
(Destiny 2, Death Stranding) add a background render/loop and heavier chrome but still
keep the option list itself typographically simple, never a button grid.

**Exemplars:**
- **Hollow Knight — Main menu** — https://interfaceingame.com/screenshots/hollow-knight-main-menu/
  — **[observed]**. Ornamental double-flourish framing the wordmark, a five-row list
  (Start Game / Options / Achievements / Extras / Quit Game) centered underneath at
  roughly 1.4x line-height, small drifting dust-mote particles behind it, version string
  and studio logo demoted to opposite corners at reduced weight. Nothing else on screen.
- **Control — Start screen** — https://interfaceingame.com/screenshots/control-start-screen/
  — **[observed]**. Even more reductive: no list yet, just an oversized wordmark
  center-frame over a slow, desaturated particle churn, and one line of microcopy below
  it ("Press ENTER to Start" with the key rendered as a literal keycap chip) — the frame
  that precedes the actual menu list, useful if Lunar Pup ever wants a title-card beat
  before the nav appears.
- **Death Stranding — Main menu** — https://interfaceingame.com/screenshots/death-stranding-main-menu/
  — **[inferred]**. An atmospheric hero render behind a simple option list — the closest
  AAA analogue to Lunar Pup's own scrim-over-3D-scene approach; useful as a ceiling
  reference for how much background detail can coexist with a plain list before it starts
  competing with the text.
- **Destiny 2 — Destinations** — https://interfaceingame.com/screenshots/destiny-2-destinations/
  — **[inferred]**. Deliberately included as a *don't*: a sci-fi hub-menu with a 3D
  orbiting map replacing the flat list — a useful density ceiling if Lunar Pup is ever
  tempted to add more than its current handful of nav items.
- **Gris — Main menu** — https://interfaceingame.com/screenshots/gris-main-menu/ —
  **[inferred]**. Likely the same watercolor restraint as its pause menu (see the
  Settings/pause note below), included for genre-tone completeness.

**Do:** keep the title/nav-list restraint and the left-accent-border hover instead of
button chrome; push version/credits to corners at reduced opacity; let ambient motion
live behind the text, never inside it. **Don't:** add a secondary nav bar, a background
video loop, or a News/Store tab — that's the AAA-density trap the corpus argues against,
and Lunar Pup's current implementation correctly avoids it already.

---

## Shop — left-list, right character/item preview

**Current Lunar Pup state:** `src/ui/cosmetics.ts`, mounted via `setupCosmeticsUI()` into
`#shop-view-body` (a div living in `src/r3f-shell/IntentViews.tsx`). Header + currency
pill, a lootbox card, then `.cosmetics-list` — a single-column list of `.cosmetics-card`
rows (title/slot/rarity/small color swatches on the left, Buy/Equip button on the right).
**There is no character or item preview panel at all** — the only visual feedback for
what an item looks like is an 18px color-swatch circle.

**Recurring pattern:** this is the single most consistent layout in the entire catalog.
A persistent top tab bar (Play/Legends/Armory/Battle Pass/Store, or equivalent)
establishes Store as one mode among several, not a separate app. Below it, either a row of
large "Featured" cards with countdown chips, or a two-pane split: a scrollable item
list/grid on one side, a large render of the hovered/selected item — or the character
wearing it — on the other. Currency (soft + hard, sometimes a third track) sits top-right,
permanently visible across every sub-tab.

**Exemplars:**
- **Apex Legends — Store** — https://interfaceingame.com/screenshots/apex-legends-store/
  — **[observed]**. Persistent top tab bar (Play/Legends/Armory/Battle Pass/**Store**,
  red underline marking the active tab) with a secondary tab row beneath it
  (Featured/Apex Packs/Legends/Apex Coins). The featured row mixes card widths — two wide
  "hero" cards left, three narrower cards right including one locked behind a
  "requires X" padlock. Each card carries a countdown pill ("3 Days 8 Hours"), a
  rarity-colored item name, and a price with its currency glyph; three currency counters
  sit top-right. Item art is angled ¾-view renders on a dark vignette, never a flat icon.
- **Cyberpunk 2077 — Inventory** — https://interfaceingame.com/screenshots/cyberpunk-2077-inventory/
  — **[observed]**. Left column: weapon list + a Stats block. Center: full-body character
  render holding the selected weapon, updating live. Right column: body-mapped equipment
  slots (Head/Upper Body/Lower Body/Special) as thumbnail tiles positioned to match where
  they sit on the silhouette. Currency and a capacity counter (`37/200`) sit top-right as
  persistent chrome, not shop-local. This is close to a direct template for Lunar Pup:
  swap "character render" for the pup + board render, keep the same three-zone split.
- **The Ascent — Store** — https://interfaceingame.com/screenshots/the-ascent-store/ —
  **[observed]**. A translucent Buy/Sell tab plus a vendor category list (Head Gear/Upper
  Body/Lower Body) floats directly over the dimmed, lit game world — no background panel
  behind the list at all, and an actual NPC vendor is visible in the scene. Proves the
  "preview" doesn't need a dedicated viewport; the live game camera can do the job.
- **Warframe — Market** — https://interfaceingame.com/screenshots/warframe-market/ —
  **[observed]**. The sparsest exemplar in the set: a small Categories dropdown + search
  box top-left, currency top-right, and the rest of the frame is almost entirely negative
  space except a faint centered title and one row of item cards along the bottom edge.
  Proof that a premium store can be mostly empty space, not a dense grid.
- **KartRider Rush+ — Shop** — https://interfaceingame.com/screenshots/kartrider-rush-shop/
  — **[observed]**. The closest genre match in the whole corpus (stylized arcade racer).
  Top bar: back button, screen title, then a single persistent row of currency counters
  (soft, hard, an energy meter) plus a "+" add-currency button. Left: category rail
  (Hot/Item/Trade/Kart/Racer/Outfit/Accessory). Center: a rotating hero promo banner above
  a 4-item "New!" row. Right: a vertical stack of discount cards, each with a strikethrough
  price and a "% OFF" ribbon. No character-preview column on this particular screen — it's
  a cosmetics-browse shop, not an equip screen — which is itself a useful distinction: the
  *equip* moment gets a preview pane, the *browse* moment gets a promo-banner-plus-discount-
  card layout. Worth keeping those two sub-patterns separate rather than merging them.

**Do:** add a persistent right-side (or center) preview — even a static render of the pup
with the hovered item equipped is enough, it doesn't need a full 3D viewport; keep currency
as permanent top-of-screen chrome (already correct in Lunar Pup's currency pill); add a
left category rail once the catalog passes roughly 15-20 items rather than waiting until
the flat list is already unmanageable. **Don't:** keep shipping color-swatch-only feedback
for an equip decision — every strong exemplar treats "what will this look like on me" as
the primary visual, never a footnote; don't collapse browse-mode and equip-mode into one
layout — KartRider and Cyberpunk show these are different jobs with different shapes.

---

## Inventory — uniform grid, not a list

**Current Lunar Pup state:** no separate inventory screen exists — owned vs. unowned items
render in the same `.cosmetics-list`, distinguished only by the button label
("Equip"/"Equipped" instead of "Buy"). The list is vertical rows, not a grid, and there is
no rarity-driven visual treatment beyond the small swatch.

**Recurring pattern:** near-universally a grid of equal-sized slots regardless of art
style — pixel-art (Moonlighter), photoreal (Cyberpunk 2077, Destiny 2), or sci-fi-minimal
(Warframe) all converge on the same grid shape. Selected/equipped state is a border or
glow treatment on the slot itself, never a resize or a move out of the grid.

**Exemplars:**
- **Moonlighter — Inventory** — https://interfaceingame.com/screenshots/moonlighter-inventory/
  — **[observed]**. An open-book UI: left page a 5-column item grid with stack-count
  badges; right page an equipment paperdoll (weapon/helmet/armor/accessory as icon tiles)
  next to a character render, plus a stat column (heart/attack/speed-style icons with
  plain numerals) in a green sidebar. A genuinely composite screen, but built from three
  simple, legible pieces — grid, paperdoll, stat strip — not one dense monolith.
- **Stray — Inventory** — https://interfaceingame.com/screenshots/stray-inventory/ —
  **[observed]**. The minimal end of the spectrum: a translucent diegetic hologram panel
  floating above the cat, showing two tabs (Inventory/Memories) and a single item card (a
  keyring labeled "KEYS") — no grid at all, because there's nothing yet to grid. The right
  precedent for what Lunar Pup's inventory should look like early: collapse to a single
  row/card rather than forcing a mostly-empty multi-row grid.
- **Destiny 2 — Armor set** — https://interfaceingame.com/screenshots/destiny-2-armor-set/
  — **[observed]**. A left rail of 6 text categories (Competitive/Gambit/Open World/
  Factions/Endgame/Leveling), a slot row of gear icons, and a hover tooltip that's denser
  and better organized than most full-screen inventories: rarity-colored header bar, a
  huge "13 POWER" numeral, three labeled stat bars at different fill levels, a one-line
  source hint, and a "Details" affordance. Included as the AAA-heavy ceiling — useful for
  the tooltip-card shape, not as a density target.
- **Horizon Zero Dawn — Weapon craft selection** — https://interfaceingame.com/screenshots/horizon-zero-dawn-weapon-craft-selection/
  — **[observed]**. A radial quick-select wheel over live, merely-dimmed (not paused)
  gameplay; the highlighted slot expands into a name, one-line description, and a
  resource-cost breakdown. Worth knowing as the diegetic end of the spectrum even though
  Lunar Pup's inventory is more likely to land on the Moonlighter/Cyberpunk full-screen
  shape.

**Do:** convert the flat `.cosmetics-list` rows into an actual grid of equal-size tiles
for owned items, promoting the existing rarity color scale from an 18px accent dot to a
full tile border/glow; collapse to a single row when the player owns very few items
(Stray's approach) rather than rendering a half-empty grid. **Don't:** import a full
paperdoll-plus-multi-stat sidebar (Division/Destiny-style) wholesale — Lunar Pup's
cosmetic depth (slot + rarity + swatch) doesn't warrant that much surface area;
Moonlighter's lighter three-piece composition (grid + simple equip slots + a short stat
strip) is the right density target.

---

## Character-select / preset loadouts

**Current Lunar Pup state:** does not exist as a screen. "Loadout" currently only means
"whatever's equipped in the shop panel" (`PlayerLoadout`/`defaultLoadout` in
`src/content/catalog.ts`) — there is no dedicated screen for browsing or selecting a named
pup + board + trail combination before a run, and no character-select/customization code
anywhere in the repo (confirmed by a repo-wide search).

**Recurring pattern:** two different things both get called "character select," and
they're worth keeping distinct. A **roster/select** screen (pick which of several
characters to play as) — Apex Legends, Overwatch, Brawl Stars. A **customization/loadout**
screen (dress up the one character/vehicle you already have) — Destiny 2's face customizer,
The Ascent's loadout screen. Lunar Pup has one playable pup, so it's squarely in the second
bucket: a **preset loadout** screen (save/recall a named combo of pup skin + board + trail)
is the right shape, not a roster grid — though the roster exemplars below are still useful
for their information-density lessons.

**Exemplars:**
- **Destiny 2 — Customize face** — https://interfaceingame.com/screenshots/destiny-2-customize-face/
  — **[observed]**. The clearest customization-bucket reference: a neutral studio-lit
  bust render fills roughly 65% of the frame on the left, a slim vertical stepper
  (Race/Gender/Face/Head Feature/Marking/Finish) sits in the middle as a progress rail,
  and the right side is a *pure preset grid* — seven face thumbnails, then color swatch
  rows for skin/mouth/eye. Zero sliders anywhere on this screen; every choice is a
  discrete thumbnail or swatch — the strongest direct evidence for "preset loadouts, not
  continuous sliders."
- **Apex Legends — Legends** — https://interfaceingame.com/screenshots/apex-legends-legends-2/
  — **[observed]**. The sharpest roster-bucket reference, included for its information-
  density lesson rather than as a literal template: two rows of legend portraits
  bottom-left, a full-height character render filling the right ~55% of frame, name in
  large display type plus an italicized one-line archetype ("BLOODHOUND" /
  "Technological Tracker") top-left, and a small secondary "View Skills" link below the
  roster. The character's own themed environment art fills the background rather than a
  neutral void — personality reads before the player opens any detail.
- **Cyberpunk 2077 — Inventory** *(cross-referenced from Inventory above)* — **[observed]**
  — the body-mapped equipment-slot layout around a center render is equally a
  customization pattern; relevant if Lunar Pup's "loadout" is really "pup + equipped
  cosmetic set" rather than a face-customization flow.
- **Brawl Stars — Brawlers** — https://interfaceingame.com/screenshots/brawl-stars-brawlers/
  — **[observed]**. A card-grid roster where each card carries a rank badge (top-left), a
  trophy count (top-center), a name + power level (bottom), and one upgrade CTA — real
  metadata density without feeling cluttered because each fact gets its own fixed
  position rather than competing for the same line. The sharpest **[observed]** reference
  in this document for how much a single preset/loadout card can carry before it needs a
  second row.
- **Overwatch — Assemble your team** — https://interfaceingame.com/screenshots/overwatch-assemble-your-team/
  — **[inferred]**. Included purely as the wrong-shape contrast case — genuine
  roster-select for a multi-character team game, not a template for a single-protagonist
  loadout screen.

**Do:** treat this as "save/recall named loadout presets" (e.g. "Race Day," "Trick Set")
built on the same left-list/right-preview layout recommended for the shop — not a new
visual system; use discrete preset thumbnails/swatches for every customization axis
exactly as Destiny 2 does, not sliders; cap each preset card's information budget to what
Brawl Stars demonstrates (identity, one key stat, one secondary stat, one CTA — four
fixed zones, not a growing list). **Don't:** build a multi-character roster grid — Lunar
Pup has one playable pup; that would be a customization screen wearing a character-select
costume, and the roster exemplars above are explicitly the wrong shape to copy wholesale.

---

## Multiplayer lobby / matchmaking / room list

**Current Lunar Pup state:** already close to the recommended pattern.
`src/ui/multiplayer.ts` renders `.mp-room` rows (room id, gamemode, player count) into a
scrollable `#mp-rooms` list with a green-bordered selected state, plus a separate
`#mp-create` form (`MultiplayerPanel.tsx`). Distinct from that, an in-play roster overlay
(`RosterOverlay.tsx`) shows on hold-Tab with per-player cards, and a persistent presence
chip (`PresenceChip.tsx`, pinned top-right) tracks connection state during multiplayer.
This is exactly the "browse rooms as a list, show who's-with-me as slots/cards
separately" split the corpus argues for — already correctly separated, not a gap.

**Recurring pattern:** the same split shows up independently across the corpus — a
browsable list/table for choosing among many rooms, a slot/avatar view once inside one,
and always one unmistakable bottom-anchored primary CTA. The player's own presence stays
visually anchored even in a matchmaking-first screen; it's never *just* a list.

**Exemplars:**
- **Overwatch — Find game** — https://interfaceingame.com/screenshots/overwatch-find-game/
  — **[observed]**. Close to a direct template for "browse many rooms": sortable columns
  (Name/Teams/Game Mode/Current Map/Ping, with a visible sort-direction arrow), a search
  box, an orange "+ CREATE" button top-right, a live in-lobby chat log bottom-left feeding
  into a bottom-anchored "JOIN" button. The clearest **[observed]** validation that a dense
  text table (Lunar Pup's `.mp-rooms` shape) is the right choice for *browsing*, with a
  chat feed underneath it rather than beside it.
- **Rocket League — New season** — https://interfaceingame.com/screenshots/rocket-league-new-season/
  — **[observed]**. Not a room browser, but the closest genre/tone match in the whole
  corpus to a moon-skating lobby: real player-owned cars visible in a dimmed (not blurred)
  stadium behind a left-aligned option list (Team Size / Difficulty / Season Length /
  Playoffs Teams, each a left/right stepper rather than a slider) and a bottom-left party
  card showing the player's name, a level badge, an XP bar, and a "Create Party" link.
  Arcade-sport, cosmetic-forward, stadium-as-backdrop — this is the composition to steal
  for a pre-run lobby over the moon surface.
- **Apex Legends — Main menu** — https://interfaceingame.com/screenshots/apex-legends-main-menu/
  — **[observed]**. Your legend stays center-frame even here: two empty diamond-outline
  slots left and right mark unfilled squad positions (an explicit "someone goes here"
  affordance, not blank space), a game-mode callout top-center shows a one-line
  description on hover, and a stacked mode-select list bottom-left leads into a large
  "READY" bar. Confirms the "player's own presence is the anchor, not the list" principle
  independently of the two exemplars above.
- **Killing Floor 2 — Store** — https://interfaceingame.com/screenshots/killing-floor-2-store/
  — **[inferred]**. Co-tagged Lobby + Store — a reminder that some games fold a store tab
  into the same lobby shell, worth considering only if Shop and Rooms ever want a shared
  frame; not a recommendation to merge them now.

**Do:** keep the list/slots split as-is; consider Overwatch's sortable-table columns if
room count grows past a screenful, and Rocket League's "party card in the corner, options
in the middle, world visible behind" composition for a pre-race ready screen; keep an
explicit empty-slot affordance for missing squad members. **Don't:** merge the room
browser and the in-room roster into one view — the current separation is correct, and
none of the strong exemplars collapse them either.

---

## Settings

**Current Lunar Pup state:** already implements the pattern the corpus argues for.
`src/ui/tuning.ts`'s `applyDraft()` writes changes to a local draft, then opens
`src/ui/confirmRevert.ts` — a "Keep these settings?" modal with a live countdown
(`DEFAULT_REVERT_SECONDS = 12`), Keep/Revert buttons, Escape-to-revert, and automatic
revert at zero. The file header literally documents this as the Dishonored 2
"Keep these settings?" pattern — this is a genuine, verified win already in place; this
pass has nothing structural to add.

**Recurring pattern (reinforced by the larger sample):** settings are a category list
(Game/Audio/Video/Controller/Keyboard or similar), not a flat wall of toggles — each
category drills into its own sub-panel, and apply-then-confirm is reserved specifically
for changes that could strand the player (display mode, resolution), not applied to every
toggle indiscriminately.

**Exemplars:**
- **Hollow Knight — Options** — https://interfaceingame.com/screenshots/hollow-knight-options/
  — **[observed]**. The root settings screen is a pure category list — Game/Audio/Video/
  Controller/Keyboard — styled identically to the main menu (same font, same flourish
  treatment), with a deliberate blank-line gap before "Back," separating forward
  navigation from the single exit action by spacing alone, no rule or box needed.
- **Dishonored 2 — Apply settings** — https://interfaceingame.com/screenshots/dishonored-2-apply-settings/
  — **[inferred]**, video, the exemplar this whole pattern is named after: an apply →
  confirm-modal → auto-revert-on-timeout flow with a visible countdown.
- **Destiny 2 — Key mapping** — https://interfaceingame.com/screenshots/destiny-2-key-mapping/
  — **[inferred]**. A dedicated rebind sub-screen distinct from the general options list —
  evidence that keybinding earns its own screen once there are enough bindable actions,
  rather than being one more row in a general list (Lunar Pup's Controls screen is
  currently separate from Settings entirely; consider folding it in as a sibling category
  instead, per Hollow Knight's structure above).
- **Cyberpunk 2077 — Gamma correction** — https://interfaceingame.com/screenshots/cyberpunk-2077-gamma-correction/
  — **[inferred]**. A calibration screen (drag until a reference image just barely reads
  correctly) rather than a bare numeric slider — a good pattern for any visual-calibration
  setting, since a raw 0-100 value gives the player no ground truth for "correct."

**Do:** nothing structural — this screen is largely done right; fold the standalone
Controls screen into the same category list as Audio/Video per the Hollow Knight
reference. If anything, extract the confirm/revert modal as a reusable primitive since
it's proven out here and is generally useful (an accidental-disconnect confirm in
multiplayer could reuse it, for instance). **Don't:** let the auto-revert pattern stay
siloed to `tuning.ts` — it's a general-purpose trust mechanism and should be pulled out
before a second screen needs it and reimplements it slightly differently. **Don't** flatten
every setting into one long scrolling list — no exemplar does this past a handful of
options.

---

## HUD (persistent in-game overlay)

**Current Lunar Pup state:** working and, per the corpus, already the most disciplined
screen in the game. Independent small components — `SpeedHud.tsx` (speedometer, actually
anchored bottom-right-of-center via a fixed right offset, not dead-center),
`TrickHud.tsx` (bottom-center, score + current trick + a landed/sketchy result popup),
`MinimapPanel.tsx` (canvas-drawn radar, enlarges on hold-M), `PresenceChip.tsx` /
`RosterOverlay.tsx` (multiplayer presence, top-right), and `ChatPanel.tsx` (bottom-left,
fades to `.chat-idle` when unused) — each independently positioned and composed together
in `App.tsx`. This matches the corpus's corner/bottom-anchored convention already.

**Recurring pattern (reinforced):** every strong HUD keeps individual readouts small,
independently anchored, and legible at a glance — none of the strongest exemplars use one
unified dashboard panel. Numeric readouts favor tabular figures so digit width doesn't
shift the layout as values change. Contextual prompts (weapon-mod select, radial
quick-select) dim the world rather than pausing it. The game's one rarity/quality color
system gets reused inside the HUD instead of inventing a HUD-only palette.

**Exemplars:**
- **Control — Select weapon mods** — https://interfaceingame.com/screenshots/control-select-weapon-mods/
  — **[observed]**. A slide-in panel over dimmed, not paused, gameplay: a breadcrumb
  header, currency top-right, a 2x2 grid of equipped-mod slots with rarity-colored corner
  pips, and a detail card for the highlighted mod (name, level, effect description, a
  red/locked requirement line, Equip/Deconstruct actions). The same rarity color system
  used in inventory tooltips elsewhere in the game carries the same visual weight here —
  one color language for the whole game, not a HUD-specific one.
- **Horizon Zero Dawn — Weapon craft selection** *(cross-referenced from Inventory above)*
  — **[observed]** — the radial quick-select wheel over live, merely-dimmed gameplay is
  itself a HUD pattern worth reusing for any mid-run quick-swap interaction.
- **Tom Clancy's The Division 2 — Inventory** — https://interfaceingame.com/screenshots/tom-clancys-the-division-2-inventory/
  — **[inferred]**. Six co-occurring tags (Character/In game/Inventory/Menu/Overlay/Stats)
  — the clearest evidence in the corpus that a HUD and an inventory can be the same
  screen when both need persistent stat readouts. Not directly applicable to Lunar Pup
  (whose HUD and inventory should stay separate, per their current clean split) but useful
  context for why some games merge them.
- **Apex Legends — Ping menu** — https://interfaceingame.com/screenshots/apex-legends-ping-menu/
  — **[inferred]**. A radial context menu anchored to the reticle/cursor rather than a
  screen corner — the pattern for any HUD affordance that needs to appear *at* a world
  location instead of a fixed frame position.

**Do:** nothing structural — anchoring and independent-component discipline are already
correct; keep any future HUD addition corner- or edge-anchored with its own single
purpose. **Don't:** let a future HUD element grow into a combined dashboard — every
strong exemplar, and Lunar Pup's own current implementation, keep each readout
single-purpose and glanceable.

---

## The single highest-impact change

Everything else in this document is either "already correct, don't touch it" (main menu,
settings, HUD, the lobby's list/slot split) or a genuine but secondary refinement
(category rails, grid-vs-list for inventory, a reusable confirm/revert primitive). The one
gap that shows up as *the* dominant structural pattern across the combined shop-store and
inventory pools (153 + 121 entries, plus the character-select pool built for this pass), and
that Lunar Pup's current cosmetics panel is missing entirely, is: **no character or item
preview.** Every strong exemplar — Cyberpunk 2077's inventory, The Ascent's store,
Control's mod screen, Warframe's market, KartRider Rush+'s shop shell — treats "what does
this look like on me, or on my board" as the primary visual, with the buy/equip list as a
secondary rail beside or below it. Lunar Pup currently answers that question with an 18px
color-swatch dot.

Concretely: give `#shop-view-body` a two-pane layout — a left-hand list of `.cosmetics-card`
rows (compacted, since they no longer need to carry the full visual weight alone) and a
persistent right-hand preview column that updates on hover/select, showing the pup with
the highlighted cosmetic equipped. It doesn't need to be a full interactive 3D viewport —
even a static render that swaps per selection, styled with the rarity-color header
treatment already defined in `tokens.css`'s rarity/glow scale (which currently exists but
isn't spent on this screen), clears the bar every **[observed]** exemplar in this document
sets. This is also the smallest change with the largest "does this feel like a real game"
delta: the design tokens needed to support it already exist, so the work is almost
entirely a layout change plus one render/preview surface, not new token invention — and
once built, the same preview column serves the shop, the inventory grid, and the new
character-select/loadout screen, since all three need to answer the identical "what does
this look like on me" question.
