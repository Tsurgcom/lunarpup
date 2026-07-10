# 21 — Build character-first Customize and ethical acquisition
STATUS: open
PRIORITY: p1
REPOS: lunarpup
COMPLEXITY: architectural
TOUCHES: src/r3f-shell/ExperienceShell.tsx, src/r3f-shell/MainMenu.tsx, src/r3f-shell/CustomizeView.tsx, src/r3f-shell/PreviewPup.tsx, src/ui/economyResources.ts, src/ui/cosmetics.ts, src/game/cosmetics.ts, src/server/cosmetics.ts, src/server/lootbox.ts, src/contracts/cosmetic.ts, content/cosmetics/, src/ui/customize.css, test/browser/customize.spec.ts, src/ui/economyResources.test.ts, docs/lootbox.md
BLOCKED_BY: 20

## Goal

Give returning players a premium place to shape their pup and acquire cosmetics without making chance, crypto, or a dense catalog the center of the product.

## Approach

Replace the imperative shop with one React-owned Customize destination centered on the preview pup. Start with Your Pup for owned/equipped cosmetics. Get More remains undiscoverable until the authenticated product state records that the player started a second run; the main menu and deep links enforce the same eligibility. Saved/curated Looks appear only when ownership density justifies them.

Use negative space, the dimmed lunar world, one emphatic type tier, and one quiet metadata tier. The pup is primary; item name, rarity, price, and action form a compact rail. Owned items use a slot-aware grid when needed and collapse gracefully when small. Rarity is never color-only.

Direct acquisition shows exact shortfall, disables impossible commands, preserves the catalog on error, and commits through replay-safe commands. Model the first 20 sessions before expanding catalog or prices.

Earned Moon Crates unlock only after second-run eligibility. They are not token- or money-purchasable. Publish odds, allow skip, provide pity, prevent duplicate loss or return full value, and preview the result on the pup. Do not claim provable fairness. Wallet, SPL, NFT export, tradable value, countdowns, and social-pressure mechanics remain disabled; paid randomness requires separate legal/product approval.

## Cross-Repo Side Effects

None.

## Verify

- `bunx playwright test test/browser/customize.spec.ts` passes as the fast blocker check for desktop release evidence.
- Before second-run start, Get More, crate, purchase actions, menu entries, and deep links remain unavailable; after eligibility they appear consistently.
- Customize has one React owner and the imperative shop no longer renders or subscribes to the same surface.
- Owned, empty, loading, offline, shortfall, pending, replayed, failed, and success states preserve context and recovery.
- Earned-crate odds, skip, pity, duplicate/full-compensation, and operation replay pass deterministic tests.
- No wallet/token/NFT or paid-randomness route is reachable from player UI.
- The 20-session economy model keeps an early meaningful direct choice affordable.
- Shared typography, response, p95 frame-time, focus, contrast, readable scaling, reduced-motion, sound-off, and lifecycle budgets pass.
- `bun run typecheck`, `bun test`, and `bun run smoke` pass with zero browser console errors.
