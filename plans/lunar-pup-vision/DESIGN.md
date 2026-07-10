# Design: Premium Lunar Pup experience

## Approach

Build Premium Lunar Pup for one launch audience: desktop arcade score-chasers. The critical journey is wallet-free and deliberately narrow: a new guest enters play quickly, experiences a satisfying short run, receives a deterministic first cosmetic, previews and equips it inline, then starts a second run. Fun, control feel, readable scoring, and retry speed must be proven before cosmetics receive prominence.

Use a vertical strangler migration into a React-owned, thin experience state machine. The machine coordinates major experience phases but does not absorb simulation, session, transport, economy, or presentation state. Each migrated system has one owner; dual rendering, duplicate event paths, and competing camera writers are prohibited.

Navigation follows a strict hierarchy: Play is primary, Customize secondary, and Settings utility. Store and chance-reward discovery begin only after the second run. Wallet features remain disabled until demand is demonstrated. Mobile and public multiplayer are separate, evidence-gated expansions rather than launch commitments.

Concern 13 convergence is a release hard gate. It is not landed: as checked on 2026-07-09, `git rev-list --left-right --count HEAD...origin/main` shows divergence in both directions. No premium-shell completion claim is valid until ownership, lifecycle, and behavior converge on the current upstream baseline.

## Key Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| Launch audience | Desktop arcade score-chasers | Crypto users broadly; mobile-first players | One concrete audience keeps control feel, session length, and interface hierarchy testable. |
| First session | Play → short run → guaranteed cosmetic → preview/equip inline → retry | First-session store or crate; wallet onboarding | The first session must prove fun and self-expression without branches, spending, or technical friction. |
| Product proof | Second-run intent is the leading signal | Funnel completion or elapsed time alone | A fast tutorial can still be joyless; retry behavior proves the game has pull. |
| UI ownership | Thin React experience state machine with independent domain resources | Patch imperative ownership; one god context; big-bang rewrite | The strangler path fixes ownership without coupling frame-time simulation, identity, economy, and transport. |
| Navigation | Play primary, Customize secondary, Settings utility | Four equal top-level destinations | Visual hierarchy should express product importance, not merely list available screens. |
| Guest identity | Server-issued principal; request-body IDs are never authoritative | Local UUID; wallet-as-identity | Rewards, cosmetics, runs, and transport need one wallet-free identity with explicit recovery semantics. |
| Transport authentication | Authenticated HTTP plus short-lived transport tickets | Bearer token in URL; unauthenticated player IDs | Browser transports need a design that avoids credential leakage and supports expiry, revocation, and reconnect. |
| Economy integrity | Transactional, replay-safe commands with operation IDs and uniqueness constraints | Separate spend/grant calls; grant-only idempotency | Buy, open, equip, and reward retries must return the original result without duplicate spend or ownership loss. |
| Run integrity | Authenticated lifecycle with one active run, expiry, and plausible server timing | Client-submitted finish events alone | This protects the ledger from trivial replay while making no false claim of cheat-proof simulation. |
| First reward | Guaranteed and deterministic | Random crate | The first reward should teach expression and replay, not chance or loss. |
| Chance rewards | Earned-only at launch, no paid randomness, published odds, skip, pity, and no duplicate loss | Token-funded crates; cash-out framing | Trust and legal exposure must not be hidden behind polished reveal motion. |
| Preview | Dedicated pup preview group in the existing Canvas; CameraRig remains sole camera writer | Mutate the live gameplay pup; second Canvas | Reuse the model and renderer without contaminating canonical state or creating competing frame owners. |
| Draft loadout | Preview state is distinct from canonical equipped state and never serialized | Shared mutable loadout | Cancel must restore exactly; only acknowledged equip updates canonical state. |
| Mobile | Time-boxed real-device proof with objective gates; otherwise desktop-first | Responsive CSS presented as mobile support | Mobile is a control and performance problem, not a layout breakpoint. |
| Multiplayer | Private/invite flows first; public prominence requires concurrency evidence | Permanent top-level public lobby | An empty lobby damages trust more than a deliberately scoped social feature. |
| Wallet | Disable UI and routes until export demand and end-to-end semantics are proven | Ship the current disabled SPL affordance | Wallet export is optional value, not identity or onboarding. |
| Craft | Typography, motion, sound, accessibility, latency, and recovery budgets apply to every slice | Final cosmetic polish pass | Premium feel is accumulated interaction correctness, not a coating applied at the end. |

## Risks

- The customization funnel may disguise weak movement, scoring, or retry motivation. First-session evaluation must lead with second-run intent and observed enjoyment.
- Branch convergence may invalidate ownership assumptions or restore transitional dual paths. Concern 13 must land and pass browser verification before implementation begins.
- Guest identity can fail across expiry, revocation, multiple tabs, cleared storage, offline recovery, and transport reconnects. These are designed states, not reload fallbacks.
- Economy retries and concurrent actions can duplicate rewards or burn currency unless every mutation is atomic and replay-safe.
- Server-observed timing rejects obvious impossibilities but does not create competitive anti-cheat. Claims must remain modest.
- Preview isolation can regress through shared camera, material, loadout, animation, or cleanup paths.
- Premature mobile, public multiplayer, wallet, or paid-random-reward work can dilute the desktop core and expand trust risk before product value is proven.

## Red Team Concerns Addressed

| Concern | Severity | Resolution |
|---|---|---|
| Cosmetics work precedes proof that skating is fun | Critical | Add a replay-worthy gameplay proof before economy or Locker expansion; require immediate retry and second-run evidence. |
| First session has too many branches | Critical | Remove shopping and chance; grant one deterministic cosmetic and offer inline Wear it / Play again actions. |
| Target audience and platform are ambiguous | Critical | Launch for desktop arcade score-chasers; mobile is a separate proof gate and wallet is not an audience definition. |
| Chance mechanics are ethically incomplete | Critical | Earned-only launch, direct acquisition available, published odds, skip, pity, duplicate protection, no cash-out, and legal review before monetization. |
| Concern 13 is falsely resolved | Critical | Keep convergence as a verified implementation blocker until upstream ancestry, runtime ownership, tests, and browser evidence agree. |
| Guest credential transport is unspecified | Critical | Require a server-issued principal for HTTP and short-lived tickets for browser transport; never trust body identifiers. |
| Idempotency does not prevent partial spend/grant failure | Critical | Put reward, buy, open, and equip behind transactional commands whose retries return the original result. |
| Run IDs can still be farmed | Critical | Add an authenticated run lifecycle, one active run, expiry, timing bounds, and explicit anti-cheat limits. |
| Live-pup preview creates ownership races | Critical | Render a dedicated preview group and keep canonical gameplay/player/network state isolated. |
| One experience context becomes a god object | Significant | Keep the experience machine narrow; session, economy, transport, and R3F presentation retain separate owners. |
| Craft and accessibility are deferred | Critical | Make semantic controls, focus, reduced motion, contrast, touch targets, feedback timing, recovery, and performance acceptance criteria in every concern. |
| Mobile gate is subjective | Significant | Use named devices and measurable control, frame-time, occlusion, completion, and retry criteria; explicitly choose desktop-first on failure. |
| Public multiplayer can advertise an empty product | Significant | Start with invite/private continuity and require concurrency evidence before public top-level prominence. |
| Wallet value is unproven | Significant | Disable wallet routes and UI; demand-test a plain-language export benefit before implementation. |

## Open Questions

None.
