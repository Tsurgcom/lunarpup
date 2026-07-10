# Deploying Lunar Pup Skater on Netlify

## What Netlify provides

[netlify.ai](https://netlify.ai) is the AI-agent entry point for Netlify deployment. It points agents to:

1. **Netlify Agent Skills** — `npx -y skills add netlify/context-and-tools --skill '*' --yes`
2. **Netlify CLI** — `npm install -g netlify-cli` then `netlify login`
3. **Netlify MCP** — `@netlify/mcp` for programmatic deploys from AI tools

Netlify hosts **static sites** and **serverless** primitives (Functions, Edge Functions, Blobs, Database). It does **not** run long-lived processes like a Bun WebSocket server.

## This project's Netlify setup

| Setting | Value |
|---------|-------|
| Build command | `bun run build` |
| Publish directory | `dist` |
| Package manager | Bun (auto-detected via `bun.lock`) |
| Config file | `netlify.toml` |

The frontend is a static Three.js game. `bun run build` bundles `index.html` and lazy-loaded chunks into `dist/`.

## How to deploy

### Option A — Git-based (recommended)

1. Push this repo to GitHub (`origin` is already `https://github.com/Tsurgcom/lunarpup.git`).
2. Log in at [app.netlify.com](https://app.netlify.com).
3. **Add new site → Import from Git** → select the repo.
4. Netlify reads `netlify.toml` automatically (build command + publish dir).
5. Deploy. Every push to `main` triggers a production deploy.

### Option B — Netlify CLI

```bash
# One-time auth (opens browser or gives a URL to approve)
npx netlify-cli login

# Link this folder to a Netlify site (creates .netlify/state.json locally)
npx netlify-cli init

# Draft deploy (preview URL)
npx netlify-cli deploy --build

# Production deploy
npx netlify-cli deploy --build --prod
```

Or deploy an existing build without rebuilding:

```bash
bun run build
npx netlify-cli deploy --dir=dist --prod
```

### Anonymous draft deploy (done)

A draft deploy was pushed via `npx netlify-cli deploy --dir=dist --allow-anonymous`:

- **URL:** http://heartfelt-souffle-58bc4c.netlify.app
- **Password:** `My-Drop-Site` (anonymous drops are password-protected)
- **Claim within 60 minutes** at [app.netlify.com/drop](https://app.netlify.com/drop) or run `netlify login` then `netlify claim` with the site ID from the CLI output.

After claiming, connect the GitHub repo for continuous deployment.

### Remaining steps for production

- **CLI not installed globally** — use `npx netlify-cli` or `npm install -g netlify-cli`.
- **Not authenticated** — run `netlify login` to claim the drop site or create a permanent site.
- **Claim or re-link** — anonymous deploys expire unless claimed; use `netlify init` for a permanent linked site.

### Option C — GitHub Actions (this repo)

`.github/workflows/ci.yml` runs on every PR and on pushes to `main`:

1. `bun run typecheck`
2. `bun test`
3. `bun run build`
4. **main:** production deploy to Netlify
5. **PRs:** Netlify draft preview URL posted as a PR comment

One-time repo secret setup (maintainer):

```bash
# Create a token at https://app.netlify.com/user/applications#personal-access-tokens
gh secret set NETLIFY_AUTH_TOKEN --repo Tsurgcom/lunarpup
gh secret set NETLIFY_SITE_ID --repo Tsurgcom/lunarpup --body "545570d4-9b21-4018-bc47-167a31557087"
```

After secrets are set, merges to `main` deploy automatically — no manual `netlify deploy --prod` needed.

## Multiplayer security — required environment variables

The multiplayer relays (Bun WS + Netlify Functions) are hardened per the audit in issue #19. Two variables gate that hardening in production:

| Variable | Default | Production requirement |
|----------|---------|------------------------|
| `MP_SESSION_SECRET` | *(dev-only public constant)* | **Required.** Signs the HMAC session tokens that bind a player id to a room (SEC-1/SEC-8). If unset in a deployed context (`NETLIFY=true`, `CONTEXT=production`, or `NODE_ENV=production`), token issuance **throws** — the code refuses to sign with the public dev fallback rather than accept forgeable sessions. Set it to a long random string in the Netlify site's environment. |
| `MP_ALLOWED_ORIGINS` | localhost dev origins | Comma-separated allow-list of the game's real origins. Used for the WebSocket `Origin` check (`src/server.ts`) **and** the Netlify Function CORS reflection (`netlify/lib/cors.ts`) — one setting covers both (SEC-2/SEC-3). `ALLOWED_ORIGINS` is accepted as a fallback name. Set it to your deployed origin(s). |

Optional tuning caps (sane defaults, override only if needed): `MAX_ROOMS` (50), `MAX_ROOM_PLAYERS` (32 per room), `GLOBAL_MAX_CONNECTIONS` (200), `MIN_STATE_INTERVAL_MS` (20 → ≤50 state updates/s per connection), `MIN_CHAT_INTERVAL_MS` (500 → ≤2 chat msgs/s per connection).

## Multiplayer on Netlify — important limitations

The game includes a **Bun WebSocket multiplayer server** (`src/server.ts`, default port **3001**). This **cannot** run on Netlify static hosting.

### What works on Netlify

- Single-player game (default, no `?multiplayer` in URL)
- Static assets, HTTPS, CDN caching

### What does not work out of the box

- `bun run dev:server` / `src/server.ts` — requires a **persistent** WebSocket process
- Default client URL `wss://<your-site>.netlify.app:3001` — Netlify does not expose arbitrary ports; port 3001 is not reachable
- In-memory room state in `server.ts` — even if ported to Functions, serverless handlers are request-scoped, not suitable for real-time room sync

### How to enable multiplayer with a Netlify-hosted frontend

1. **Host the game on Netlify** (static `dist/`).
2. **Run the WebSocket server elsewhere**, e.g. Railway, Fly.io, Render, a VPS, or any host that supports long-lived Bun processes:
   ```bash
   PORT=3001 bun src/server.ts
   ```
3. **Point the browser at the external server** via query param (see `src/net/protocol.ts`):
   ```
   https://your-site.netlify.app/?multiplayer&room=lunar-park&ws=wss://your-ws-host.example.com
   ```
   Use `wss://` (not `ws://`) when the game is served over HTTPS.

### Alternatives (require code changes)

- Rewrite multiplayer on **Netlify Functions** + a managed realtime service (PartyKit, Ably, Pusher, etc.)
- Use **Netlify Edge** for lightweight request handling — still not a substitute for persistent WebSockets

## Local development (unchanged)

```bash
bun install
bun run dev          # game + multiplayer server together
bun run dev:game     # frontend only
bun run dev:server   # WebSocket server only (port 3001)
```
