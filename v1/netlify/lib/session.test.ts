import { describe, expect, test } from 'bun:test';
import { issueSessionToken, verifySessionToken } from './session.ts';

describe('session tokens', () => {
    test('issues and verifies a bound room/id token', async () => {
        const token = await issueSessionToken('room-a', 'player-1');
        expect(await verifySessionToken(token, 'room-a', 'player-1')).toBe(true);
        expect(await verifySessionToken(token, 'room-b', 'player-1')).toBe(false);
        expect(await verifySessionToken(token, 'room-a', 'player-2')).toBe(false);
    });

    test('rejects tampered tokens', async () => {
        const token = await issueSessionToken('room-a', 'player-1');
        expect(await verifySessionToken(`${token}x`, 'room-a', 'player-1')).toBe(false);
    });
});
