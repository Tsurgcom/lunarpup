import { afterEach, describe, expect, test } from 'bun:test';

function clearOriginEnv() {
    delete process.env.MP_ALLOWED_ORIGINS;
    delete process.env.ALLOWED_ORIGINS;
}

afterEach(clearOriginEnv);

async function freshCors() {
    return await import(`./cors.ts?${Math.random().toString(36).slice(2)}`) as typeof import('./cors.ts');
}

function reqWithOrigin(origin?: string): Request {
    const headers = new Headers();
    if (origin !== undefined) headers.set('origin', origin);
    return new Request('https://fn.example/mp', { method: 'POST', headers });
}

describe('cors allow-list', () => {
    test('MP_ALLOWED_ORIGINS admits a listed origin and rejects others', async () => {
        process.env.MP_ALLOWED_ORIGINS = 'https://play.lunarpup.gg,https://lunarpup.gg';
        const { isCorsAllowed, corsHeaders } = await freshCors();
        expect(isCorsAllowed(reqWithOrigin('https://play.lunarpup.gg'))).toBe(true);
        expect(corsHeaders(reqWithOrigin('https://play.lunarpup.gg'))['Access-Control-Allow-Origin'])
            .toBe('https://play.lunarpup.gg');
        expect(isCorsAllowed(reqWithOrigin('https://evil.example'))).toBe(false);
        expect(corsHeaders(reqWithOrigin('https://evil.example'))['Access-Control-Allow-Origin']).toBeUndefined();
    });

    test('ALLOWED_ORIGINS is honored as a fallback name (no silent divergence from the WS server)', async () => {
        process.env.ALLOWED_ORIGINS = 'https://play.lunarpup.gg';
        const { isCorsAllowed } = await freshCors();
        expect(isCorsAllowed(reqWithOrigin('https://play.lunarpup.gg'))).toBe(true);
        expect(isCorsAllowed(reqWithOrigin('https://evil.example'))).toBe(false);
    });

    test('with no allow-list configured, a browser origin is rejected (fail closed)', async () => {
        const { isCorsAllowed } = await freshCors();
        expect(isCorsAllowed(reqWithOrigin('https://anything.example'))).toBe(false);
    });

    test('never reflects a wildcard', async () => {
        process.env.MP_ALLOWED_ORIGINS = 'https://play.lunarpup.gg';
        const { corsHeaders } = await freshCors();
        const values = Object.values(corsHeaders(reqWithOrigin('https://play.lunarpup.gg')));
        expect(values).not.toContain('*');
    });
});
