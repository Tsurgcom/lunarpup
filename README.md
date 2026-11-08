# Lunar Pup (v3)

Browser moon-skate game. The **active game is the repo root**. Also ships as a
**Tauri v2** desktop/mobile app (`src-tauri/`).

Earlier attempts are frozen as copy sources:

| Folder | What it is |
| --- | --- |
| [`v1/`](v1/) | Pre-rewrite R3F game (chunked PCG terrain, Newtonian hover physics). Snapshot of `origin/cursor/newtonian-physics-hoverboard` @ `9cfa7c1`. |
| [`v2/`](v2/) | Sphere clipmap moon, Trystero multiplayer, board-frame camera. Snapshot of `main` @ `4933616`. |

## Run v3 (browser)

```bash
bun install
bun run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Run Tauri (desktop)

Requires [Rust](https://rustup.rs/) and platform WebView deps
([Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)).

```bash
bun install
bun run tauri:dev      # desktop app + Vite on :3000
bun run tauri:build    # production bundles
```

## Mobile

```bash
# One-time scaffolds (Android needs ANDROID_HOME/NDK_HOME/JAVA_HOME;
# iOS init only works on macOS with Xcode)
./scripts/tauri-mobile-init.sh

bun run tauri:android:dev
bun run tauri:android:build

# macOS only:
bun run tauri:ios:dev
bun run tauri:ios:build
```

Deep links use the `lunarpup://` scheme (e.g. `lunarpup://party/pup-a1b2c3`).

## Run an archive

```bash
cd v1   # or v2
bun install
bun run dev
```

Use each archive’s own `README.md` / `AGENTS.md` for controls and architecture.
