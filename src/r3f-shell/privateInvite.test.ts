import { describe, expect, test } from 'bun:test';
import { buildPrivateInviteUrl } from './privateInvite.ts';

describe('buildPrivateInviteUrl', () => {
    test('preserves the secret fragment key and strips the sender name', () => {
        const invite = buildPrivateInviteUrl('https://play.example/?room=moon&name=Alice#k=secret-key');
        expect(invite).toBe('https://play.example/?room=moon&multiplayer=#k=secret-key');
    });

    test('refuses to create an invite without a matching room key', () => {
        expect(buildPrivateInviteUrl('https://play.example/?room=moon')).toBeNull();
    });
});
