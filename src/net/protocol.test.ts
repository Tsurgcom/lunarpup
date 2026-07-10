import { describe, expect, test } from 'bun:test';
import type { PlayerSnapshot } from './protocol.ts';
import { parseClientMessage } from './protocol.ts';

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

const envelope = { iv: 'iv', data: 'data' };

function parse(message: unknown) {
    return parseClientMessage(JSON.stringify(message));
}

describe('parseClientMessage', () => {
    test('parses a join message from a Buffer payload', () => {
        const payload = Buffer.from(JSON.stringify({
            type: 'join',
            room: 'lunar-park',
            name: envelope,
            state: envelope,
            seq: 0,
        }));

        expect(parseClientMessage(payload)).toEqual({
            type: 'join',
            room: 'lunar-park',
            name: envelope,
            state: envelope,
            seq: 0,
        });
    });

    test('parses encrypted state snapshots', () => {
        expect(parse({ type: 'state', room: 'lunar-park', id: 'pup-1', seq: 3, state: envelope })).toEqual({
            type: 'state',
            room: 'lunar-park',
            id: 'pup-1',
            seq: 3,
            state: envelope,
        });
    });

    test('parses optional routing fields for leave and chat messages', () => {
        expect(parse({ type: 'leave' })).toEqual({ type: 'leave' });
        expect(parse({ type: 'chat', payload: envelope })).toEqual({
            type: 'chat',
            payload: envelope,
        });
    });

    test('rejects malformed JSON and non-objects', () => {
        expect(parseClientMessage('{')).toBeNull();
        expect(parseClientMessage(JSON.stringify(null))).toBeNull();
        expect(parseClientMessage(JSON.stringify([]))).toBeNull();
    });
});
