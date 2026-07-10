import { describe, expect, test } from 'bun:test';
import { createRemotePlayerRecord, isLocalMultiplayerId, updateRemotePlayerTarget } from './multiplayer.ts';

describe('isLocalMultiplayerId', () => {
    test('matches only the active local player id', () => {
        expect(isLocalMultiplayerId('abc', 'abc')).toBe(true);
        expect(isLocalMultiplayerId('abc', 'def')).toBe(false);
        expect(isLocalMultiplayerId('', 'abc')).toBe(false);
    });
});

describe('remote cosmetic synchronization', () => {
    const snapshot = {
        id: 'remote', name: 'Remote Pup', color: 0xffb703,
        x: 0, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1,
        heading: 0, speed: 0, isGrounded: true, boardTiltX: 0, boardTiltZ: 0,
    };

    test('increments a render revision and updates current cosmetics after a post-join equip', () => {
        const record = createRemotePlayerRecord(snapshot);
        const changed = updateRemotePlayerTarget(record, { ...snapshot, cosmetics: { board: 'moon-board' } });

        expect(changed).toBe(true);
        expect(record.cosmeticsRevision).toBe(1);
        expect(record.current.cosmetics).toEqual({ board: 'moon-board' });
        expect(updateRemotePlayerTarget(record, { ...snapshot, cosmetics: { board: 'moon-board' } })).toBe(false);
        expect(record.cosmeticsRevision).toBe(1);
    });
});
