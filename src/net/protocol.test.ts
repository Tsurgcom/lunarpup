import { describe, expect, test } from 'bun:test';
import type { PlayerSnapshot } from './protocol.ts';

describe('PlayerSnapshot cosmetics compatibility', () => {
    test('accepts old snapshots without cosmetics and new snapshots with cosmetics', () => {
        const oldSnapshot: PlayerSnapshot = {
            id: 'old-client',
            name: 'Old Pup',
            color: 0xffb703,
            x: 1,
            y: 2,
            z: 3,
            qx: 0,
            qy: 0,
            qz: 0,
            qw: 1,
            heading: 0,
            speed: 0,
            isGrounded: true,
            boardTiltX: 0,
            boardTiltZ: 0,
        };
        const newSnapshot: PlayerSnapshot = { ...oldSnapshot, id: 'new-client', cosmetics: { board: 'board-id', trail: 'trail-id' } };

        expect(oldSnapshot.cosmetics).toBeUndefined();
        expect(newSnapshot.cosmetics?.trail).toBe('trail-id');
    });
});
