/**
 * End-to-end encryption for Lunar Pup multiplayer.
 *
 * The relay servers (Netlify functions + the dev WebSocket server) are *blind
 * relays*: they never hold the room key and can only store/forward opaque
 * encrypted envelopes. All sensitive player data — names, positions, chat — is
 * encrypted client-to-client with AES-GCM 256 via the Web Crypto API.
 *
 * Key distribution: the room key is a 256-bit random secret carried in the URL
 * *fragment* (`#k=…`). URL fragments are never sent to the server, so the relay
 * never sees the key. Players who want to play together share the full link.
 *
 * The server-side routing room id is derived from the key (SHA-256), so the
 * server can route players that share a key together without ever learning the
 * key itself.
 *
 * NOTE on IP addresses: E2E encryption protects message *content*. The relay
 * still observes connecting client IPs at the network/TLS layer — that is
 * fundamental to any server you connect to and cannot be hidden by encryption
 * alone. What this changes is that the relay can no longer link an IP to a
 * player's identity, read their chat, or read their positions, and any stored
 * state (Netlify Blobs) is now ciphertext.
 */

/** An opaque encrypted payload. Both fields are base64url strings. */
export interface EncryptedEnvelope {
    iv: string;
    data: string;
}

const IV_BYTES = 12;
const KEY_BYTES = 32;

/* ----------------------------- base64url helpers ---------------------------- */

export function bytesToBase64url(bytes: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64urlToBytes(b64: string): Uint8Array<ArrayBuffer> {
    const padded = b64.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64.length + 3) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

/* ------------------------------ key management ------------------------------ */

/** Generate a fresh 256-bit room key, returned as base64url. */
export function generateRoomKey(): string {
    return bytesToBase64url(crypto.getRandomValues(new Uint8Array(KEY_BYTES)));
}

/** Derive the server-side routing room id from a room key (base64url).
 *  The result is opaque to the server: it cannot be inverted to recover the key. */
export async function deriveRoomId(roomKey: string): Promise<string> {
    const keyBytes = base64urlToBytes(roomKey);
    const digest = await crypto.subtle.digest('SHA-256', keyBytes);
    return bytesToBase64url(new Uint8Array(digest)).slice(0, 22);
}

/* -------------------------------- the cipher -------------------------------- */

export class RoomCipher {
    private constructor(private key: CryptoKey) {}

    static async fromKey(roomKey: string): Promise<RoomCipher> {
        const keyBytes = base64urlToBytes(roomKey);
        if (keyBytes.length !== KEY_BYTES) {
            throw new Error(`Invalid room key length: expected ${KEY_BYTES} bytes, got ${keyBytes.length}`);
        }
        const key = await crypto.subtle.importKey(
            'raw',
            keyBytes,
            { name: 'AES-GCM' },
            false,
            ['encrypt', 'decrypt'],
        );
        return new RoomCipher(key);
    }

    /** Encrypt a JSON-serialisable value into an envelope. */
    async encrypt(value: unknown): Promise<EncryptedEnvelope> {
        const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
        const plaintext = new TextEncoder().encode(JSON.stringify(value));
        const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, this.key, plaintext);
        return { iv: bytesToBase64url(iv), data: bytesToBase64url(new Uint8Array(ciphertext)) };
    }

    /** Decrypt an envelope back into its original value, or `null` on failure. */
    async decrypt<T>(envelope: EncryptedEnvelope): Promise<T | null> {
        try {
            const iv = base64urlToBytes(envelope.iv);
            const ciphertext = base64urlToBytes(envelope.data);
            const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, this.key, ciphertext);
            return JSON.parse(new TextDecoder().decode(plaintext)) as T;
        } catch {
            return null;
        }
    }
}

/* --------------------------- change-detection (seq) ------------------------- */
/**
 * A cheap plaintext fingerprint computed *client-side* so the client only sends
 * a state update (and bumps its sequence number) when the player's state actually
 * changed. The relay compares opaque `seq` values to dedupe — it never sees the
 * plaintext this is derived from.
 */
export function stateFingerprint(state: {
    x: number; y: number; z: number;
    qx: number; qy: number; qz: number; qw: number;
    heading: number; speed: number; isGrounded: boolean;
    boardTiltX: number; boardTiltZ: number;
}): string {
    return [
        state.x, state.y, state.z,
        state.qx, state.qy, state.qz, state.qw,
        state.heading, state.speed, state.isGrounded ? 1 : 0,
        state.boardTiltX, state.boardTiltZ,
    ].map(n => Number(n).toFixed(3)).join('|');
}
