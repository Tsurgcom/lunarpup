# Game UI pattern reference (source: interfaceingame.com)

Distilled from interfaceingame.com's screenshot/video catalog for the Lunar Pup UI
overhaul. Raw entries are in `catalog.json` (same directory), one array per category,
each `{title, game, pageUrl, mediaUrl, tags}`.

## Method and honesty notes

- The site (Interface In Game, a Vue-rendered WordPress theme) organizes every
  screenshot/video under a 21-value "Elements" taxonomy: `character, credits, dialogue,
  game-over, in-game, inventory, level-selection, loading, lobby, map, main-menu,
  overlay, progress, quest, scoreboard, settings, skill-tree, start-screen, stats,
  store, tutorial`. This is the full discovered taxonomy — there is no sitemap listing
  of it; it was extracted from the filter-checkbox markup on `/screenshots/`.
- The requested categories don't map 1:1 onto that taxonomy. Direct matches: **settings
  → `settings`**, **shop/store → `store`**, **inventory → `inventory`**, **lobby →
  `lobby`**. Proxied (no dedicated tag exists, entries selected by title keyword within
  a broader tag): **HUD** from `overlay`/`in-game`, **leaderboard/results** from
  `scoreboard` + `game-over` + `stats`, **pause menu** and **main menu** both live
  under the single `main-menu` tag (split by title text — genuinely thin: only 2 pause
  menu examples surfaced across 7 pages of that tag), **lootbox/reward/gacha** has no
  tag at all — the closest proxy is `progress`/`quest`/`store` entries whose titles
  mention reward/chest/pack/unlock, **notifications/toasts** likewise has no tag — proxied
  from `overlay`/`in-game` titles mentioning alert/popup/unlocked (only 3 examples found;
  this is the weakest category in the catalog).
- I did **not** watch any video. For `.mp4` entries, patterns below come from the title,
  the tag set, the game's genre, and well-known, widely-documented conventions for that
  game (marked **[inferred]**). For three `.jpg` entries I downloaded the still image and
  actually looked at it — those are marked **[observed]** and are more trustworthy than
  the inferred ones.
- Sitemap access worked fine: `robots.txt` allows all crawling and points at
  `sitemap_index.xml`, which lists `games-sitemap.xml`, `articles-sitemap.xml`,
  `categories-sitemap.xml` (blog categories, not UI categories), and 17
  `attachment-sitemap*.xml` files. None of those enumerate the Elements taxonomy or
  individual screenshots in a way that beats the filtered listing pages, so the catalog
  was built from `https://interfaceingame.com/screenshots/?elements=<slug>` (and its
  `page/N/` pagination) instead — no fallback was needed, the site scraped cleanly.

---

## Settings / options (save & apply)

**Exemplar (required):** Dishonored 2 — Apply settings —
https://interfaceingame.com/screenshots/dishonored-2-apply-settings/ — tags: Menu,
Overlay, Settings. **[inferred, well-known convention]** This is the canonical "apply →
confirm modal with auto-revert countdown" pattern: user changes a setting (usually
resolution/display), hits Apply, a modal appears over the now-changed screen asking
"Keep these settings?" with a visible countdown (e.g. 15s); if the user does nothing the
modal times out and the change silently reverts; explicit Yes/Keep commits it
immediately. The value is that it protects against a bad change (e.g. wrong resolution)
locking the user out of the settings screen itself.

Other exemplars: Dishonored 2 — Main menu (Menu, Settings) and Hollow Knight — Audio /
Controller settings (Settings only, no Menu tag — a flatter, single-purpose panel).

**Patterns:**
- Grouped sliders/toggles under labeled sections (Video / Audio / Controls), not one
  flat list — visible even at the tag level (Settings entries are almost always
  co-tagged Menu, meaning they live inside a full-screen menu context, not an in-game
  overlay).
- The apply → confirm → auto-revert flow is specifically reserved for settings whose
  effect can't be trivially undone by re-opening the menu (display mode, resolution) —
  it is Dishonored 2's *only* settings sub-screen tagged this way among its ~8 menu
  screenshots, so this is a targeted safety pattern, not applied to every toggle.
- Reset-to-default and Copy/export controls (seen as the sibling row in Lunar Pup's own
  `tuning-panel` today) are a distinct, simpler pattern from apply/revert — both can
  coexist.

**Do:** confirm destructive/blocking changes with a timed auto-revert modal; group
settings by domain; keep a visible countdown so the user isn't surprised by a silent
revert. **Don't:** apply every setting instantly with no confirmation path if the
setting can break the display; don't hide the countdown number (users need to know how
long they have).

---

## HUD

Proxied from `overlay` (3021 tagged) and `in-game` (5218 tagged) — the site doesn't
separate "persistent HUD" from "any overlay/modal", so entries here include some
non-HUD overlays; the ones below are the ones whose titles read as actual gameplay HUD.

Exemplars: Dishonored 2 — Death has taken you (Game over, In game, Overlay)
**[inferred]**; Apex Legends — Ping menu (In game, Menu, Overlay) **[inferred]**;
Tom Clancy's The Division 2 — Inventory (Character, In game, Inventory, Menu, Overlay,
Stats) **[inferred]**, fetched detail page confirms it's an .mp4 with 6 co-tags — i.e.
the inventory screen itself carries HUD-like persistent stat readouts (Stats, Character)
alongside the modal inventory grid.

**Patterns:**
- Corner-anchored persistent elements (health/ammo/minimap/objective), center-bottom
  transient callouts (kill feed, pickup notices, contextual prompts) — this is the
  overwhelmingly dominant convention across the genre and matches Lunar Pup's own
  existing layout (speedometer bottom-right, trick-hud bottom-center, agent-hud
  top-left).
- HUD elements frequently co-occur with "Menu"/"Overlay" tags, meaning a well-designed
  HUD reuses the same visual language (translucent panel, consistent corner radius,
  consistent type scale) as the game's modal screens rather than looking like a
  separate system.
- Death/game-over states are tagged as HUD overlays, not separate screens, in several
  entries (Dishonored 2 dims/tints the world and holds the HUD in place while showing
  the death message) — i.e. game-over-as-overlay is common; game-over-as-full-screen
  (like Lunar Pup's own `#gamemode-results`) is a different, valid alternative used when
  a match rather than a single life ends.

**Do:** keep HUD chrome visually consistent with menu/overlay chrome (same panel style,
blur, radius); anchor persistent info to corners, transient info to center-bottom.
**Don't:** invent a fourth visual language for the HUD when the game already has one for
menus and overlays — reuse it.

---

## Shop / store

Direct tag match: `store` (721 tagged).

Exemplars: Apex Legends — Apex packs (Store) **[inferred]**, detail-fetched: a `.mp4`,
single-tag, meaning the pack-opening/purchase screen is treated as its own isolated
flow, not layered into the main menu; Apex Legends — Battle pass (Menu, Progress, Stats,
Store) **[inferred]** — by contrast this one is heavily co-tagged, meaning battle-pass
progression UI blends store, stats, and progress concerns in one screen; Apex Legends —
Weapon skin (Inventory, Store) **[inferred]**.

**Patterns:**
- Two distinct store shapes recur: (1) a **catalog/grid** shop (skins, packs) reachable
  from a top-level nav tab, tagged `Store` sometimes alone; (2) a **progression-store**
  hybrid (battle pass) that mixes store with stats/progress in a single screen with
  tiered rewards.
- Currency balance is near-universally shown top-right or in a persistent header bar
  (visible in the real Apex Legends main-menu screenshot: three currency counters —
  Legend Tokens, Legend/Crafting materials, Apex Coins — sit top-right of every tab,
  not just the Store tab) **[observed]** — i.e. currency is global chrome, not
  store-local.
- Item detail (price, rarity, preview) opens as a focused sub-panel or modal rather than
  navigating away from the grid.

**Do:** keep currency balance visible everywhere, not just inside the shop; separate
"buy now" catalog flows from "earn via progress" flows visually even if they share a
tab. **Don't:** bury the currency balance only inside the shop screen — Lunar Pup's own
cosmetics panel already does this right (`.cosmetics-pill` shows balance in the panel
header).

---

## Inventory

Direct tag match: `inventory` (1243 tagged).

Exemplars: Tom Clancy's The Division 2 — Inventory (Character, In game, Inventory,
Menu, Overlay, Stats) **[inferred]** — six co-tags is the highest density in the whole
catalog, meaning a AAA looter-shooter inventory screen is really one composite screen
(character paperdoll + stat readout + item grid + menu chrome) rather than a single-
purpose grid; Tom Clancy's Ghost Recon Breakpoint — Headwear transition (Character,
Inventory, Menu) **[inferred]**; Hollow Knight — Inventory (In game, Inventory, Overlay)
**[inferred]** — only 3 tags, a much flatter, minimal-game inventory (fits Lunar Pup's
visual register better than the Division 2 example).

**Patterns:**
- Grid of equally-sized item slots is the near-universal layout; equipped/selected
  state gets a border/glow treatment, not a resize.
- Heavier inventories (Division 2-style) add a persistent character stat sidebar;
  lighter ones (Hollow Knight-style) don't — pick based on how much build-crafting depth
  Lunar Pup's cosmetics actually have (currently: slot + rarity + swatch preview, which
  argues for the lighter pattern).
- Rarity is communicated by color, consistently, across inventory *and* store *and*
  lootbox reveal — Lunar Pup's own `.cosmetics-swatch`/`.lootbox-rarity-*` classes
  already do this; the overhaul should keep one rarity palette used everywhere, not
  three.

**Do:** uniform grid, glow/border for equipped state, one rarity color scale reused
across inventory/shop/lootbox. **Don't:** mix a heavy stat-sidebar inventory with an
otherwise minimal game aesthetic.

---

## Lootbox / reward / gacha

No dedicated tag on the source site — proxied from `progress`/`quest`/`store` titles
mentioning reward/chest/pack/unlock. Weak category by catalog construction, not a site
gap in the pattern itself (lootbox UI is extremely common in the wider dataset, just
untagged distinctly).

Exemplars found this way: Heroes of the Storm — Open chest **[inferred]**; Clash Royale
— Open Chest **[inferred]**; Gwent — Reward book **[inferred]**; Apex Legends — Apex
packs (reused from the Shop section above — packs are simultaneously a store item and a
lootbox mechanic).

**Patterns (well-known convention, all inferred):**
- Three-beat structure: (1) **acquire/afford** — show cost or "you have N crates"; (2)
  **open** — a dedicated full-screen or modal moment, usually with a build-up animation
  (spin, crack, glow-then-burst) that briefly withholds the result; (3) **reveal** —
  rarity-coded result card, with duplicate-handling shown explicitly (refund/shard
  conversion) rather than silently discarded.
- Published odds (a legal requirement in many markets now) are shown either on the
  open screen or one tap away, not hidden — Lunar Pup's own `lootboxPanel()` in
  `src/ui/cosmetics.ts` already surfaces `lootboxOdds.odds` inline, which matches this
  convention well.
- Rarity color scale from Inventory/Shop repeats here without change.

**Do:** withhold the result briefly (even 300-500ms of build-up reads as more rewarding
than an instant reveal); show odds; make duplicate-refund explicit. **Don't:** let the
open button be spammable — disable it during the reveal animation (Lunar Pup already
does this via `openingLootbox`).

### User-provided exemplars: CS:GO/CS2 skin-gambling site **[observed]**

Two user-supplied captures (a catalog screenshot and a 10.6s recording of a 4-player
"case battle"; frames extracted with ffmpeg) — the only entries in this category where
the *motion* was directly observed rather than inferred. Referenced in `catalog.json`
as the first two `lootbox-reward-gacha` entries with `file://` media URLs.

**Catalog row anatomy (screenshot):** dark navy background; horizontal row of case
cards, each = 3D case art render, name, price in a teal-green pill, and a small
segmented horizontal meter under each (yellow-to-green fill, reading as an odds/
value-heat indicator). The hovered/featured card adds a red top-border accent, a red
sparkline at its foot, a weapon-category badge, and a "+0.39 coin" cashback tag.
Takeaway: a lootbox catalog card is legible from four stacked elements — art, name,
cost, chance-signal — and the chance-signal lives on the card itself, not behind a tap.

**Open/reveal loop (recording):** the strongest observed motion reference in this
document.
- Pre-spin beat: a glowing yellow case icon pulses alone in the active column before
  any items appear — the "acquire → open" beat separation from the three-beat structure
  above, observed literally.
- The reveal is a **vertical slot-reel spin per player column** that decelerates onto
  the won item (roughly 2-3s per round). Deceleration, not a fixed-duration crossfade,
  is what produces the anticipation.
- The active player's column carries a yellow-orange border glow while its reel
  resolves — an "active actor highlight" that keeps a 4-way simultaneous UI readable.
- **Value is first-class and live:** every item shows a price; per-column running
  totals tick up immediately on each resolve ($3.04 → $3.23, $377.91 → $378.10); a
  round counter ("ROUND 17/70") frames a multi-open as progression; numerals are
  effectively tabular/monospace.
- A persistent **drop-history grid** sits below the live reels: every prior drop with
  wear tag (WW/FN) and price, with the single rare item (a $375.06 knife) color-flagged
  orange while commons stay dim — the rarity-color-does-the-work principle again.
- **Anti-patterns to explicitly not copy** (this is a real-money gambling site and much
  of its craft is compulsion machinery): the live-chat "rain" pot with Join button and
  countdown (FOMO), real-currency framing throughout, and an always-on social feed
  encouraging further spending. Lunar Pup should take the reel-spin reveal, the
  active-column glow, the live totals, and the card anatomy — and none of the
  compulsion loops. Lunar Pup's existing published-odds + duplicate-refund approach is
  the ethical inverse of this site's design goals and should stay.

---

## Lobby / matchmaking / room list

Direct tag match: `lobby` (217 tagged) — the smallest dedicated tag, but sufficient.

Exemplars: Apex Legends — Main menu (Character, Lobby, Menu) **[observed]** — fetched
the actual 1920×1080 still. It shows: top tab bar (Play / Legends / Armory / Battle
Pass / Store) with the active tab underlined in the accent color; three currency
counters top-right; a large center-stage character render; two empty "add player"
diamond slots flanking the character (party-of-3 visualized directly on the hub, not in
a separate lobby list); a left-side vertical stack of game-mode rows with a description
tooltip on hover and a bottom "READY" call-to-action bar; a bottom-right icon cluster
(stats/friends/settings). Apex Legends — Select legend (Loading, Lobby) **[inferred]**;
Elite Dangerous — Docking in station (In game, Lobby) **[inferred]** — an example of a
diegetic, in-world "lobby" (a station dock) rather than a menu screen, notable given
Lunar Pup's own moon-skating setting; Brawl Stars — Lobby (Lobby, Character, Menu)
**[inferred]**.

**Patterns:**
- Party/room composition shown as visual slots (avatars or add-icons), not a plain
  text list, whenever the roster is small (2-4 players) — text lists (like Lunar Pup's
  current `.mp-rooms`) appear more for *browsing many rooms* than for showing *who's in
  your current room*. Both patterns coexist: a room browser list to choose a room, then
  a slot-based roster once inside it.
- One unmistakable, bottom-anchored primary CTA ("READY"/"PLAY") — never inline with
  secondary buttons.
- Game-mode selection is a persistent side list with the current mode always visible,
  not a modal you open and close.

**Do:** separate "browse rooms" (list) from "who's with me right now" (slots); anchor
one obvious primary CTA at the bottom; keep mode selection persistently visible.
**Don't:** make the party roster a dense text list once a player is already in a room —
that's the room-browser's job, not the in-room view's.

---

## Leaderboard / results / score

Proxied from `scoreboard` (223) + `game-over` (208) + relevant `stats` (2015) entries.

Exemplars: Dishonored 2 — Game over (Game over, In game, Menu, Overlay) **[inferred]**;
Apex Legends — Game over (Game over, In game, Overlay) **[inferred]**; Tom Clancy's The
Division 2 — World named enemies defeated (In game, Menu, Overlay, Scoreboard, Stats)
**[inferred]**; Overwatch — Match summary (Progress, Stats) **[inferred]**.

**Patterns:**
- Game-over/results screens are tagged `Overlay` far more than as a standalone page —
  reinforcing the HUD section's point that the world stays visible/dimmed behind the
  result, rather than cutting to a blank screen. Lunar Pup's `#gamemode-results` already
  does this correctly (positioned over the scene, not a page navigation).
- Score/stat readouts favor monospace or tabular-numeral type for the number itself,
  with a smaller label above/below in the regular UI face — visible in Lunar Pup's own
  `#trick-score`/`#gamemode-status` (already monospace) — this is a convention worth
  keeping, not changing.
- Summary screens bundle multiple stat lines (Overwatch's Match summary is tagged both
  Progress and Stats) rather than a single score number — worth doing for Lunar Pup's
  results screen (currently just distance/trick score per `#gamemode-results p`).

**Do:** keep results as an overlay over the dimmed world, not a page cut; use
monospace/tabular numerals for the score; show 2-4 stat lines, not just one number.
**Don't:** cut away from the game world for a result screen if it's mid-session (do it
for true match-end summaries only).

---

## Notifications / toasts

No dedicated tag — proxied from `overlay`/`in-game` titles mentioning
alert/popup/unlocked. Only 3 entries surfaced; explicitly the weakest, most inferred
category in this catalog.

Exemplars: Tom Clancy's The Division 2 — Echo unlocked (In game) **[inferred]**;
Flinthook — Alert (In game, Overlay) **[inferred]**; Toca Life World — Age Confirmation
Pop Up (Overlay, Menu) **[observed]** — fetched the still image. It's a centered modal
card (not a corner toast): white header band with a bold headline ("Hi there!"), a blue
body with the message and a numeric keypad, an explicit close (X) top-right, and a
reassurance line ("This information is not stored."). Useful less as a style match (kid's
game, not sci-fi) and more as a structural example of a **blocking confirmation modal**
versus the next pattern.

**Patterns (mostly inferred, low confidence):**
- Two different things get called "notification" and shouldn't be conflated: (1) a
  **transient, non-blocking toast** (unlock/achievement pings — "Echo unlocked") that
  appears, holds briefly, and dismisses itself without input; (2) a **blocking modal**
  (age gate, confirmation) that requires an explicit action to dismiss and darkens/blocks
  the rest of the screen. Lunar Pup's own `#update-notice` is presently a hybrid: styled
  and positioned like a toast (top-center, compact) but behaves like a blocking modal
  in importance (persists indefinitely, requires a click) with no auto-dismiss and no
  stacking if a second one fired.
- Toasts stack from one edge (commonly top-center or top-right) when more than one is
  active; this needs explicit engineering support (a container that stacks/queues), not
  just one `#update-notice`-style singleton div.

**Do:** decide explicitly, per message, whether it's a self-dismissing toast or a
blocking modal — don't let one component do both jobs. **Don't:** assume this category
is well-covered by the reference — it's the thinnest one here; lean on general toast
conventions (top-anchored stack, auto-dismiss 3-5s, manual dismiss always available)
more than on the specific catalog entries.

---

## Pause menu

Both pause menu and main menu live under the single `main-menu` tag on this site (6124
entries) — split here by title text. Only 2 pause-menu-titled entries surfaced across 7
fetched pages of that tag, so treat this as thin but high-quality (one of the two is an
excellent style match).

Exemplars: **Gris — Pause menu (Menu)** **[observed]** — fetched the still image, and
it is close to a perfect stylistic reference for Lunar Pup. Pure black background;
everything drawn as thin white concentric circles and orbit rings (visually reads as a
star chart/orrery) with small filled dots as "planets" sitting on the rings; menu items
(RESUME / SETTINGS / QUIT) are placed directly on the ring geometry rather than in a
list box, in a light, wide-tracked all-caps sans-serif; a controller-button glyph
("Ⓑ BACK") bottom-right doubles as both a legend and a functional hint. No panel
background, no borders, no drop shadows — the diegesis (this reads as literally a solar
system) does all the framing work that a bordered box would otherwise do. Need For
Speed Heat — Pause Menu (Menu) **[inferred]** — by contrast, presumably a much more
conventional dark-panel-with-list treatment typical of racing-game pause menus.

**Patterns:**
- A pause menu is usually the single most "quiet" screen in a game — Gris strips it to
  line art and typography with zero chrome, deliberately lower-energy than gameplay.
  This is a strong, directly transferable idea for a moon/space setting: menu-as-orrery,
  concentric rings standing in for orbit paths, dots standing in for moons/planets.
- Resume is always the default/first-focus item, Quit is always last/furthest, matching
  a left-to-right or top-to-bottom severity gradient.

**Do (for Lunar Pup specifically):** consider a literal orbit-ring pause menu — it is
both extremely on-theme (moon skating, celestial setting) and matches this catalog's
single highest-quality exemplar. **Don't:** default to a bordered dark rectangle with a
button stack; that's the Need For Speed pattern, not the one that fits this game.

---

## Main menu

Same `main-menu` tag, filtered to non-pause titles (Main menu, Start game, Menu
transition, Start screen…).

Exemplars: Dishonored 2 — Main menu (Menu, Settings) **[inferred]**; Endless Space 2 —
Main menu (Menu) **[inferred]** — a 4X space-strategy game, good stylistic proximity;
Hollow Knight — Main menu / Start game (Menu) **[inferred]** — minimal, atmospheric,
single-tag simplicity; Gris — Main menu (Menu) **[inferred]** — very likely the same
orrery language as its pause menu, given both share only the `Menu` tag and nothing
else; Detroit: Become Human — Main menu (Menu) **[inferred]**.

**Patterns:**
- Co-tag pattern confirms main menus are usually tagged `Menu` alone or `Menu, Settings`
  — i.e. a main menu commonly embeds or links directly into settings rather than
  treating it as a fully separate destination requiring its own navigation chrome.
- Atmospheric/minimal-game main menus (Hollow Knight, Gris) use very few UI elements —
  a title treatment, 3-5 text options, no boxes/panels — vs. AAA menus which add
  background video loops, character art, and a fuller nav bar. Lunar Pup's visual
  register (moon, low-poly, minimal palette) argues for the former.

**Do:** treat main menu and settings as adjacent, easily reachable from one another
(same visual system, one click apart). **Don't:** import AAA menu density (background
video, multiple nav bars, News/Store tabs) into a small, atmospheric game — match
Hollow Knight/Gris restraint instead.

---

## Cross-cutting patterns (apply to all categories)

1. **One shared visual language across every screen.** Repeatedly, entries carry
   overlapping tags (Menu+Settings, Menu+Store, Overlay+Scoreboard) — the site's own
   taxonomy is evidence that well-executed game UI doesn't context-switch its visual
   system per screen. Panel treatment, corner radius, blur, type scale, and rarity
   colors should be tokens shared across every Lunar Pup UI file, not re-declared
   per-panel as `src/styles.css` currently does (each `#foo-panel` block hand-repeats
   the same `background: rgba(10, 10, 25, 0.72); border: 1px solid rgba(255,255,255,0.14);
   border-radius: 10px; box-shadow: 0 8px 30px rgba(0,0,0,0.3);` combination).
2. **Overlay-over-dimmed-world beats page-cut for anything mid-session.** Game-over,
   settings-apply, and lootbox-reveal all recur as overlays on top of (or masking) the
   live scene rather than full navigations — Lunar Pup already does this for
   `#gamemode-results`; the overhaul should keep every future modal (settings-apply
   confirm, pause menu) on this same footing.
3. **The confirm/auto-revert pattern is a general-purpose trust mechanism, not just a
   display-settings trick.** Anywhere a user action is hard to undo or easy to get wrong
   in a way that locks them out (display settings, but by extension: tuning-panel
   physics changes that could make the game unplayable, or an accidental disconnect
   from a room), a timed confirm-or-revert modal is the transferable shape.

---

## Mapping onto Lunar Pup's actual screens

Read from `src/ui/*.ts` (agentHud.ts, chat.ts, cosmetics.ts, minimap.ts, multiplayer.ts,
speedLines.ts, tricks.ts, tuning.ts, updateNotice.ts) and `src/styles.css`
(`styles.css` has no section-comment banners — screens are identified below by their
root element ID/class instead).

| Lunar Pup screen | File(s) | Current state | Reference pattern to apply |
|---|---|---|---|
| Agent HUD | `src/ui/agentHud.ts`, `#agent-hud` | Working; card list of harness sessions, status pill, screen-pulse flash on needs-input | Already closest to "shared visual language" — good baseline for tokens (blur, radius, pill shape) to extract into the shared system |
| Tuning panel | `src/ui/tuning.ts`, `#tuning-panel` | Live-applies every slider change immediately, only Reset/Copy, no Apply/confirm step | **Settings** pattern: add an explicit Apply with a Dishonored-2-style auto-revert confirm for changes that could break playability (e.g. gravity/speed extremes) — currently the biggest concrete gap the exemplar addresses |
| Cosmetics shop + lootbox | `src/ui/cosmetics.ts`, `#cosmetics-panel`, `.lootbox-*` | Functionally complete: catalog grid, currency pill, lootbox odds card, open button with a basic pop animation (three bouncing diamonds), rarity color classes | **Shop** + **Lootbox** patterns: replace the diamond-bounce with a decelerating reel-spin reveal per the observed CS-site recording (pre-spin glow beat → reel decelerates onto result → rarity-colored result card); adopt the observed catalog-card anatomy (art, name, price pill, odds meter on the card); unify rarity palette across shop/inventory/lootbox. Explicitly skip the gambling-site compulsion machinery (FOMO timers, social pressure feeds) |
| Room browser / lobby | `src/ui/multiplayer.ts`, `#multiplayer-panel`, `.mp-rooms`, `.mp-create` | Text-list room browser + inline create form; no distinct "who's in my room right now" view | **Lobby** pattern: keep the text list for browsing, add a slot/avatar-based roster view once inside a room, and a single unmistakable bottom "Ready"/"Join" CTA |
| Minimap | `src/ui/minimap.ts`, `#minimap-panel` | Canvas panel, top-right | Fold into shared panel tokens (already close: same rgba/border/radius/shadow recipe as the other panels) |
| Chat | `src/ui/chat.ts`, `#chat-panel` | Collapsible log + form, bottom-right | Fine as-is structurally; align its collapse/expand chrome with the shared token set |
| Trick score / speed lines | `src/ui/tricks.ts`, `src/ui/speedLines.ts`, `#trick-hud`, `#speed-lines` | Working; monospace score, animated pop-in result banner | **HUD** + **leaderboard** pattern already followed correctly (monospace numerals, center-bottom transient callout) — use as the reference implementation when building the token system, don't rewrite it |
| Mode select / results | (inline in `src/main.ts` or `src/modes/*`, `#gamemode-panel`, `#gamemode-results`) | Working; button row + status readout, centered modal-style results overlay | **Leaderboard/results** pattern already correctly modal-over-scene; expand `#gamemode-results` to show 2-4 stat lines instead of one, per the Overwatch/Division exemplars |
| Update notice | `src/ui/updateNotice.ts`, `#update-notice` | Singleton top-center banner, no auto-dismiss, no stacking | **Notifications/toasts**: split into an actual toast (auto-dismissing, stackable) system; keep this update banner as the one deliberately-persistent exception (a real update *should* stay until dismissed) but implement it on top of a real toast/notification component, not as a one-off div |
| Main menu | *(does not exist yet)* | No pre-game menu; game boots straight into the 3D scene | **Main menu** pattern: minimal/atmospheric per Hollow Knight/Gris — title treatment + 3-5 options, linking directly to Settings |
| Pause menu | *(does not exist yet)* | No pause screen | **Pause menu** pattern: the Gris orrery treatment is an unusually good thematic fit (moon/orbit) for Lunar Pup and should be the starting concept, not a generic dark panel |

Every row above is a candidate concern for the implementation plan in
`plans/lunar-pup-vision/10-ui-overhaul.md`.
