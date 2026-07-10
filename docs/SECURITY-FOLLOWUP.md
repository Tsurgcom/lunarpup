# Security follow-up — residuals after issue #19

This PR closes the fail-open + the confirmed high/medium residuals from a two-lineage
adversarial review (codex/gpt-5.6 + grok-4.5) of the already-hardened multiplayer relay.
The findings below are **real but deliberately deferred** — each needs a change large or
subtle enough to warrant its own reviewed PR rather than expanding this one past the point
of reviewability. Ranked by severity, with the reviewer that raised each.

## Deferred (tracked, not fixed here)

| Sev | Finding | Why deferred / direction |
|-----|---------|--------------------------|
| MED | **Non-atomic Blobs room caps (SEC-5/10 race)** — `joinRoom` does read-modify-write on the room index with no compare-and-set, so concurrent joins can exceed `MAX_ROOM_PLAYERS`/`MAX_ROOMS` and orphan billable per-player/state blobs. *(codex)* | Needs conditional writes (Netlify Blobs `onlyIfMatch`/etag) or a single-writer index. Real change to `room-store.ts`; test with simulated concurrency. |
| MED | **No HTTP-path state rate limit (SEC-6)** — the WS relay caps state at 50/s per connection, but the Netlify `mp.ts` `state` POST has no server-side limit; a token holder can flood Blobs writes. *(codex)* | Netlify Functions are stateless, so this needs per-token/room throttle state (Blobs-backed token bucket) or an upstream gateway limit. |
| MED | **SSE token in query string (SEC-6/logs)** — `EventSource` can't set headers, so the session token rides in the `?token=` URL and can land in CDN/access logs, reusable for up to the 1h TTL. *(codex)* | Mitigation: issue a separate short-TTL (30–60s) single-use *stream* token at connect, exchanged for the SSE. Also shorten the main TTL. |
| MED | **Runtime schema validation is a TS cast (SEC-4-adjacent)** — `parseClientMessage`/HTTP handlers check `type` + shape by assertion; a malformed typed payload can throw inside a handler (e.g. `msg.room.trim()` when `room` isn't a string). WS `join` room-type is now guarded, but envelopes/seq/HTTP bodies are not fully validated. *(codex)* | Add a small runtime validator (zod-style or hand-rolled) at every ingress; return 400 instead of throwing. |
| LOW | **CSP allows `'unsafe-inline'` + `'unsafe-eval'` (SEC-9)** — required today by the R3F/bundler runtime; tightening needs nonces/hashes and testing that WebGL/wasm still loads. *(codex)* | Move inline styles/scripts to files or nonce them, drop `unsafe-eval` if the bundler allows, then remove from CSP. Verify in-browser before shipping. |
| LOW | **Function/Edge responses don't set security headers (SEC-9)** — `netlify.toml` headers apply to static assets; the Function/Edge responses set only CORS. *(codex)* | Add the header set to the Function/Edge response builders. |
| INFO | **Origin check allows absent `Origin` (SEC-3)** — deliberate: browsers always send `Origin`, and non-browser clients can spoof it anyway, so it's not an auth boundary. Both reviewers agree this is acceptable. *(codex/grok)* | No change; documented so it isn't "rediscovered." |

## Fixed in this PR (for cross-reference)

- Production fail-closed when `MP_SESSION_SECRET` is unset (was a public fallback secret → forgeable tokens).
- **HIGH**: fail closed *before* the first storage write in `mp.ts` join (was: write blobs, then throw).
- Origin config unified on `MP_ALLOWED_ORIGINS` (+ `ALLOWED_ORIGINS` fallback); docs corrected.
- WS per-room player cap (`MAX_ROOM_PLAYERS`) and chat rate limit (`MIN_CHAT_INTERVAL_MS`).
- SSE membership revocation + 30s token re-verify (was: authorize once, poll forever).
- HSTS header added.

## Reviewer verdict summary

Two independent lineages, run per the repo's security-review policy. Both rejected the
"all 11 fixed" framing; codex assessed 6 CLOSED / 4 PARTIAL / 1 OPEN before this PR, grok
5 CLOSED / 6 PARTIAL. This PR moves the PARTIAL/OPEN set forward; the table above is what
remains.
