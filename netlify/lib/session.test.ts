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

    test('rejects garbage without throwing', async () => {
        expect(await verifySessionToken('', 'r', 'i')).toBe(false);
        expect(await verifySessionToken('no-dot', 'r', 'i')).toBe(false);
        expect(await verifySessionToken('.sigonly', 'r', 'i')).toBe(false);
    });

    test('a token signed with a different secret does not verify (no forgery)', async () => {
        const mkFresh = () => import(`./session.ts?${Math.random().toString(36).slice(2)}`) as Promise<typeof import('./session.ts')>;
        process.env.MP_SESSION_SECRET = 'secret-one';
        const a = await mkFresh();
        const token = await a.issueSessionToken('r', 'i');
        process.env.MP_SESSION_SECRET = 'secret-two';
        const b = await mkFresh();
        expect(await b.verifySessionToken(token, 'r', 'i')).toBe(false);
        delete process.env.MP_SESSION_SECRET;
    });

    test('fails closed in production when MP_SESSION_SECRET is unset', async () => {
        const prev = process.env.NODE_ENV;
        process.env.NODE_ENV = 'production';
        try {
            const fresh = await import(`./session.ts?${Math.random().toString(36).slice(2)}`) as typeof import('./session.ts');
            await expect(fresh.issueSessionToken('r', 'i')).rejects.toThrow(/MP_SESSION_SECRET is required/);
        } finally {
            if (prev === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = prev;
        }
    });

    test('assertSessionSecret throws in production before any mutation (synchronous guard)', async () => {
        const prev = process.env.NODE_ENV;
        process.env.NODE_ENV = 'production';
        try {
            const fresh = await import(`./session.ts?${Math.random().toString(36).slice(2)}`) as typeof import('./session.ts');
            expect(() => fresh.assertSessionSecret()).toThrow(/MP_SESSION_SECRET is required/);
        } finally {
            if (prev === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = prev;
        }
    });

    test('assertSessionSecret is a no-op when configured', async () => {
        process.env.MP_SESSION_SECRET = 'test-secret-abc';
        const { assertSessionSecret } = await import(`./session.ts?${Math.random().toString(36).slice(2)}`) as typeof import('./session.ts');
        expect(() => assertSessionSecret()).not.toThrow();
        delete process.env.MP_SESSION_SECRET;
    });
});
