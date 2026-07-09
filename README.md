# Lunar Pup Skater 3D

A Three.js moon-skating game with procedural chunked terrain (PCG LOD).

## Development

```bash
bun install
bun run dev
```

Opens a hot-reloading dev server from `index.html`.

## Production build

```bash
bun run build
```

Outputs minified, code-split bundles to `dist/`:

- `index.html` — entry page
- `index-*.js` — entry + shared chunks (including Three.js ~525 KB)
- `bootstrap-*.js`, `scene-*.js`, `terrain-*.js`, `player-*.js`, `loop-*.js`, `tuning-*.js`, `speedLines-*.js`, `input-*.js` — lazy-loaded game modules
- `index-*.css` — bundled styles

Preview the production build:

```bash
bun run preview
```

## Multiplayer (end-to-end encrypted)

Multiplayer is opt-in: append `?multiplayer` to the URL. Two transports are
supported:

- **HTTP/SSE** (production, Netlify) — players POST state to `/api/mp` and
  subscribe to an SSE stream at `/api/mp/stream`. State is held in Netlify Blobs.
- **WebSocket** (local dev) — `bun run dev:server` runs the relay in `src/server.ts`.

### How the encryption works

All player-to-player data — **names, positions, and chat** — is encrypted
client-to-client with **AES-GCM 256** (Web Crypto). The relay servers (Netlify
functions + the dev WebSocket server) are **blind relays**: they store and
forward opaque encrypted envelopes and never hold the room key, so they cannot
read any player content. They only assign opaque player ids + colours and route
by a room id.

Key distribution:

- A 256-bit **room key** is carried in the URL **fragment** (`#k=…`). URL
  fragments are never sent to the server, so the relay never sees the key. If
  no key is present, the client generates one and writes it to the fragment.
- The **server-side routing room id** is derived from the key (SHA-256), so the
  server can route players that share a key without ever learning the key itself.
- To play together, **share the full URL** (it carries the key in the fragment).
  Anyone without the key cannot decrypt the room's traffic.
- A client-computed `seq` counter replaces the old server-side plaintext
  fingerprint for change-detection, so the relay dedupes without inspecting state.

### A note on IP addresses

End-to-end encryption protects message **content**. The relay still observes
connecting client IPs at the network/TLS layer — that is fundamental to any
server you connect to and cannot be hidden by encryption alone. What this change
*does* guarantee: the relay can no longer link an IP to a player's identity,
read their chat, or read their positions, and any persisted state (Netlify Blobs)
is now ciphertext. The server logs also no longer contain player names.

## Project layout

```
src/
  main.ts           # Browser entry point
  styles.css        # UI styles
  config.ts         # Game constants
  state.ts          # Shared runtime state
  net/              # E2E-encrypted multiplayer client (crypto.ts, client.ts, protocol.ts)
  game/             # Scene, terrain, player, loop, input, multiplayer wiring
  ui/               # Tuning panel, speed lines, chat, multiplayer status
netlify/            # Blind-relay server (functions + edge SSE + room store)
index.html          # HTML shell
dist/               # Build output (generated)
legacy/             # Original saved HTML snapshot
```
