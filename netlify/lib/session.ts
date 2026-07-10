import { bytesToBase64url, base64urlToBytes } from './base64url.ts';

const TOKEN_TTL_MS = 60 * 60 * 1000;

interface SessionPayload {
    room: string;
    id: string;
    exp: number;
}

async function hmacKey(): Promise<CryptoKey> {
    const raw = process.env.MP_SESSION_SECRET ?? 'lunarpup-dev-session-secret';
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
    return crypto.subtle.importKey(
        'raw',
        digest,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign', 'verify'],
    );
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
