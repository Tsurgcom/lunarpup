import { bytesToBase64url, base64urlToBytes } from './base64url.ts';

const TOKEN_TTL_MS = 60 * 60 * 1000;

const DEV_SECRET = 'lunarpup-dev-session-secret';

interface SessionPayload {
    room: string;
    id: string;
    exp: number;
}

/**
 * Resolve the HMAC secret, failing closed in production.
 *
 * The dev fallback is a public constant (this file ships in a public repo), so
 * signing production tokens with it would let anyone forge a session for any
 * {room, id} — the exact impersonation SEC-1/SEC-8 close. In a deployed context
 * (Netlify, or NODE_ENV=production) an unset MP_SESSION_SECRET is therefore a
 * hard error rather than a silent downgrade; locally it warns once and uses the
 * dev constant so `bun run dev` still works.
 */
function resolveSecret(): string {
    const configured = process.env.MP_SESSION_SECRET?.trim();
    if (configured) return configured;

    const isProd = process.env.NETLIFY === 'true'
        || process.env.CONTEXT === 'production'
        || process.env.NODE_ENV === 'production';
    if (isProd) {
        throw new Error('MP_SESSION_SECRET is required in production — refusing to sign session tokens with the public dev fallback secret.');
    }

    if (!warnedAboutDevSecret) {
        warnedAboutDevSecret = true;
        console.warn('[session] MP_SESSION_SECRET is unset — using the public DEV secret. Session tokens are forgeable; set MP_SESSION_SECRET before any real deployment.');
    }
    return DEV_SECRET;
}

let warnedAboutDevSecret = false;

async function hmacKey(): Promise<CryptoKey> {
    const raw = resolveSecret();
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
    return crypto.subtle.importKey(
        'raw',
        digest,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign', 'verify'],
    );
}

/**
 * Throw NOW if the session secret is unusable (production without MP_SESSION_SECRET),
 * so a caller can fail closed BEFORE performing any storage mutation. `issueSessionToken`
 * validates the same way, but it runs after `joinRoom` has already written blobs — calling
 * this first keeps an unconfigured production deploy from creating billable state.
 */
export function assertSessionSecret(): void {
    resolveSecret();
}

export async function issueSessionToken(room: string, id: string): Promise<string> {
    const payload: SessionPayload = { room, id, exp: Date.now() + TOKEN_TTL_MS };
    const payloadB64 = bytesToBase64url(new TextEncoder().encode(JSON.stringify(payload)));
    const key = await hmacKey();
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadB64));
    return `${payloadB64}.${bytesToBase64url(new Uint8Array(sig))}`;
}

export async function verifySessionToken(token: string, room: string, id: string): Promise<boolean> {
    try {
        const dot = token.indexOf('.');
        if (dot <= 0) return false;
        const payloadB64 = token.slice(0, dot);
        const sigB64 = token.slice(dot + 1);
        if (!sigB64) return false;

        const key = await hmacKey();
        const valid = await crypto.subtle.verify(
            'HMAC',
            key,
            base64urlToBytes(sigB64),
            new TextEncoder().encode(payloadB64),
        );
        if (!valid) return false;

        const payload = JSON.parse(new TextDecoder().decode(base64urlToBytes(payloadB64))) as SessionPayload;
        return payload.room === room && payload.id === id && payload.exp > Date.now();
    } catch {
        return false;
    }
}
