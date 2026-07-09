import { describe, expect, test } from 'bun:test';
import type { ServerWebSocket } from 'bun';
import { ModularRouter } from './router.ts';

interface TestConnection { id: string }

describe('ModularRouter', () => {
    test('dispatches registered HTTP routes by method and path', async () => {
        const router = new ModularRouter<TestConnection>();
        router.registerHttp('GET', '/health', () => new Response('ok', { status: 204 }));

        const response = await router.handleHttp(new Request('http://localhost/health'), {
            server: {} as never,
            upgrade: () => false,
        });
        expect(response?.status).toBe(204);
        expect(await router.handleHttp(new Request('http://localhost/missing'), { server: {} as never, upgrade: () => false })).toBeUndefined();
    });

    test('dispatches explicit WebSocket channels', () => {
        const router = new ModularRouter<TestConnection>();
        const seen: unknown[] = [];
        router.registerWebSocket('agent', (_ws, payload) => seen.push(payload));

        const handled = router.dispatchWebSocket({} as ServerWebSocket<TestConnection>, { channel: 'agent', type: 'agent_status' });
        expect(handled).toBe(true);
        expect(seen).toHaveLength(1);
    });

    test('defaults legacy messages without channel to multiplayer', () => {
        const router = new ModularRouter<TestConnection>();
        let messageType = '';
        router.registerWebSocket('multiplayer', (_ws, payload) => {
            if (typeof payload === 'object' && payload && 'type' in payload) messageType = String(payload.type);
        });

        expect(router.dispatchWebSocket({} as ServerWebSocket<TestConnection>, { type: 'join', room: 'lunar-park', name: 'Pup' })).toBe(true);
        expect(messageType).toBe('join');
        expect(router.dispatchWebSocket({} as ServerWebSocket<TestConnection>, { channel: 'unknown' })).toBe(false);
    });
});
