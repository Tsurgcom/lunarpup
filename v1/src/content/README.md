# Content catalog

Content definitions separate cosmetic identity from gameplay systems.

- `animals`: animal model/animation metadata and attachment points.
- `skateboards`: board model and wheel/deck metadata.
- `materials`: texture/material metadata.
- `PlayerLoadout`: IDs only; safe to send through multiplayer join/session messages later.

Current dog and classic board entries are metadata-only. `VoxelDogModel.tsx` is the runtime source of truth for local and remote player presentation.
