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

const validState = {
    x: 1,
    y: 2,
    z: 3,
    qx: 0,
    qy: 0,
    qz: 0,
    qw: 1,
    heading: 0.5,
    speed: 8,
    isGrounded: true,
    boardTiltX: 0.1,
    boardTiltZ: -0.1,
};

function parse(message: unknown) {
    return parseClientMessage(JSON.stringify(message));
}

describe('parseClientMessage', () => {
    test('parses a join message from a Buffer payload', () => {
        const payload = Buffer.from(JSON.stringify({ type: 'join', room: 'lunar-park', name: 'Pup' }));

        expect(parseClientMessage(payload)).toEqual({ type: 'join', room: 'lunar-park', name: 'Pup' });
    });

    test('parses a complete finite state snapshot', () => {
        expect(parse({ type: 'state', room: 'lunar-park', id: 'pup-1', state: validState })).toEqual({
            type: 'state',
            room: 'lunar-park',
            id: 'pup-1',
            state: validState,
        });
    });

    test('parses optional routing fields for leave and chat messages', () => {
        expect(parse({ type: 'leave' })).toEqual({ type: 'leave', room: undefined, id: undefined });
        expect(parse({ type: 'chat', text: 'hello' })).toEqual({
            type: 'chat',
            room: undefined,
            id: undefined,
            text: 'hello',
        });
    });

    test('rejects malformed JSON, non-objects, and unknown message types', () => {
        expect(parseClientMessage('{')).toBeNull();
        expect(parseClientMessage(JSON.stringify(null))).toBeNull();
        expect(parseClientMessage(JSON.stringify([]))).toBeNull();
        expect(parse({ type: 'teleport', x: 1 })).toBeNull();
    });

    test('rejects messages missing required fields or with invalid optional fields', () => {
        expect(parse({ type: 'join', room: 'lunar-park' })).toBeNull();
        expect(parse({ type: 'chat', text: 42 })).toBeNull();
        expect(parse({ type: 'leave', id: 42 })).toBeNull();
    });

    test('rejects state snapshots with missing, non-finite, or non-boolean fields', () => {
        const nonFiniteState = JSON.stringify({ type: 'state', state: validState })
            .replace('"speed":8', '"speed":1e999');

        expect(parseClientMessage(nonFiniteState)).toBeNull();
        expect(parse({ type: 'state', state: { ...validState, qw: undefined } })).toBeNull();
        expect(parse({ type: 'state', state: { ...validState, isGrounded: 'yes' } })).toBeNull();
    });
});
