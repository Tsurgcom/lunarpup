# Lunar Pup (v3)

Browser moon-skate game. The **active game is the repo root**.

Earlier attempts are frozen as copy sources:

| Folder | What it is |
| --- | --- |
| [`v1/`](v1/) | Pre-rewrite R3F game (chunked PCG terrain, Newtonian hover physics). Snapshot of `origin/cursor/newtonian-physics-hoverboard` @ `9cfa7c1`. |
| [`v2/`](v2/) | Sphere clipmap moon, Trystero multiplayer, board-frame camera. Snapshot of `main` @ `4933616`. |

## Run v3

```bash
bun install
bun run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Run an archive

```bash
cd v1   # or v2
bun install
bun run dev
```

Use each archive’s own `README.md` / `AGENTS.md` for controls and architecture.
