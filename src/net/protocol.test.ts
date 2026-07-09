import { describe, expect, test } from 'bun:test';
import { parseClientMessage } from './protocol.ts';

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
