/**
 * Decelerating slot-reel reveal for the Moon Crate (observed CS-site pattern:
 * pre-spin glow beat -> vertical reel that decelerates onto the won item ->
 * rarity-coloured landing state). The animation itself is CSS (a single
 * expo-out transition on the reel track); this module owns the two testable,
 * DOM-free pieces: the phase state machine and the strip layout.
 */

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

export interface ReelItem {
    id: string;
    name: string;
    rarity: string;
    colors: string[];
}

export type ReelPhase = 'idle' | 'glow' | 'spinning' | 'landed';
export type ReelEvent = 'open' | 'result' | 'settle' | 'reset';

/**
 * Phase transitions. Invalid event/phase pairs are no-ops so a late
 * transitionend or a double click can't corrupt the sequence.
 *
 *   idle --open--> glow --result--> spinning --settle--> landed
 *   (any) --reset--> idle
 */
export function reelTransition(phase: ReelPhase, event: ReelEvent): ReelPhase {
    if (event === 'reset') return 'idle';
    if (phase === 'idle' && event === 'open') return 'glow';
    if (phase === 'glow' && event === 'result') return 'spinning';
    if (phase === 'spinning' && event === 'settle') return 'landed';
    return phase;
}

/** The reveal is mid-flight — the Open button stays disabled through it. */
export function isReelBusy(phase: ReelPhase): boolean {
    return phase === 'glow' || phase === 'spinning';
}

export interface ReelStrip {
    cells: ReelItem[];
    winnerIndex: number;
}

export interface ReelStripOptions {
    length?: number;
    /** How many filler cells sit past the winner (the scroll-past overshoot). */
    trailing?: number;
    /** Injectable RNG in [0, 1) for deterministic tests. */
    rng?: () => number;
}

/**
 * Build a reel strip that ends on the winner. Filler cells are drawn from the
 * pool so the spinning reel reads as "any of these could land"; the winner is
 * pinned near the end with a few trailing cells so the deceleration overshoots
 * slightly before settling.
 */
export function buildReelStrip(
    pool: ReelItem[],
    winner: ReelItem,
    options: ReelStripOptions = {},
): ReelStrip {
    const { length = 24, trailing = 2, rng = Math.random } = options;
    const total = Math.max(length, trailing + 1);
    const winnerIndex = total - 1 - trailing;

    const draw = pool.length > 0 ? pool : [winner];
    const cells: ReelItem[] = [];
    for (let i = 0; i < total; i++) {
        if (i === winnerIndex) {
            cells.push(winner);
            continue;
        }
        const pick = Math.min(draw.length - 1, Math.floor(rng() * draw.length));
        cells.push(draw[pick]!);
    }

    return { cells, winnerIndex };
}
