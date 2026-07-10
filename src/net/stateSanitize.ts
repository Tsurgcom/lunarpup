import type { PlayerSnapshot } from './protocol.ts';

const MAX_COORD = 1e6;

type PlayerStateFields = Omit<PlayerSnapshot, 'id' | 'name' | 'color'>;

const COSMETIC_SLOTS = ['board', 'body', 'trail', 'aura'] as const;

function sanitizeCosmetics(value: unknown): PlayerStateFields['cosmetics'] {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const source = value as Record<string, unknown>;
    const sanitized: NonNullable<PlayerStateFields['cosmetics']> = {};
    for (const slot of COSMETIC_SLOTS) {
        const id = source[slot];
        if (typeof id === 'string' && id.length <= 128) sanitized[slot] = id;
    }
    return sanitized;
}

function finiteCoord(value: unknown, fallback = 0): number {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(-MAX_COORD, Math.min(MAX_COORD, n));
}

/** Coerce decrypted peer state to finite, clamped numbers before applying transforms. */
export function sanitizePlayerState(state: PlayerStateFields): PlayerStateFields {
    return {
        x: finiteCoord(state.x),
        y: finiteCoord(state.y),
        z: finiteCoord(state.z),
        qx: finiteCoord(state.qx),
        qy: finiteCoord(state.qy),
        qz: finiteCoord(state.qz),
        qw: finiteCoord(state.qw, 1),
        heading: finiteCoord(state.heading),
        speed: finiteCoord(state.speed),
        isGrounded: typeof state.isGrounded === 'boolean' ? state.isGrounded : true,
        boardTiltX: finiteCoord(state.boardTiltX),
        boardTiltZ: finiteCoord(state.boardTiltZ),
        cosmetics: sanitizeCosmetics(state.cosmetics),
    };
}
