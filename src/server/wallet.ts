import nacl from 'tweetnacl';
import bs58 from 'bs58';
import type { ModularRouter } from './router.ts';

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

interface WalletChallenge {
    playerId: string;
    walletAddress: string;
    nonce: string;
    issuedAt: number;
    message: string;
}

export interface WalletSession {
    playerId: string;
    walletAddress: string;
    authenticatedAt: string;
}

export class WalletAuthService {
    private readonly challenges = new Map<string, WalletChallenge>();
    private readonly sessionsByPlayer = new Map<string, WalletSession>();

    createChallenge(playerId: string, walletAddress: string, now = Date.now()): WalletChallenge {
        if (playerId.length === 0) throw new Error('playerId is required');
        const normalizedAddress = normalizeSolanaAddress(walletAddress);
        const nonce = crypto.randomUUID();
        const issuedAtIso = new Date(now).toISOString();
        const message = `Lunar Pup wallet sign-in\nPlayer: ${playerId}\nWallet: ${normalizedAddress}\nNonce: ${nonce}\nIssued At: ${issuedAtIso}\nDevnet only.`;
        const challenge = { playerId, walletAddress: normalizedAddress, nonce, issuedAt: now, message };
        this.challenges.set(nonce, challenge);
        return challenge;
    }

    verifyChallenge(input: { playerId: string; walletAddress: string; nonce: string; signature: string }, now = Date.now()): WalletSession {
        const challenge = this.challenges.get(input.nonce);
        if (!challenge) throw new Error('wallet challenge not found');
        if (now - challenge.issuedAt > CHALLENGE_TTL_MS) {
            this.challenges.delete(input.nonce);
            throw new Error('wallet challenge expired');
        }
        const walletAddress = normalizeSolanaAddress(input.walletAddress);
        if (challenge.playerId !== input.playerId || challenge.walletAddress !== walletAddress) throw new Error('wallet challenge does not match player or wallet');
        const signature = Buffer.from(input.signature, 'base64');
        const ok = nacl.sign.detached.verify(new TextEncoder().encode(challenge.message), signature, bs58.decode(walletAddress));
        if (!ok) throw new Error('wallet signature invalid');
        this.challenges.delete(input.nonce);
        const session = { playerId: input.playerId, walletAddress, authenticatedAt: new Date(now).toISOString() };
        this.sessionsByPlayer.set(input.playerId, session);
        return session;
    }

    sessionForPlayer(playerId: string): WalletSession | undefined {
        return this.sessionsByPlayer.get(playerId);
    }
}

export function normalizeSolanaAddress(walletAddress: string): string {
    const decoded = bs58.decode(walletAddress);
    if (decoded.length !== 32) throw new Error('walletAddress must be a 32-byte base58 Solana public key');
    return bs58.encode(decoded);
}

export function registerWalletModule<TConnection>(router: ModularRouter<TConnection>, auth = new WalletAuthService()): WalletAuthService {
    router.registerHttp('POST', '/wallet/challenge', async (request) => {
        const body = await request.json() as { playerId?: unknown; walletAddress?: unknown };
        if (typeof body.playerId !== 'string' || typeof body.walletAddress !== 'string') return json({ error: 'playerId and walletAddress are required' }, 400);
        try {
            const challenge = auth.createChallenge(body.playerId, body.walletAddress);
            return json({ playerId: challenge.playerId, walletAddress: challenge.walletAddress, nonce: challenge.nonce, message: challenge.message, expiresInMs: CHALLENGE_TTL_MS });
        } catch (error) {
            return json({ error: error instanceof Error ? error.message : 'failed to create wallet challenge' }, 400);
        }
    });

    router.registerHttp('POST', '/wallet/verify', async (request) => {
        const body = await request.json() as { playerId?: unknown; walletAddress?: unknown; nonce?: unknown; signature?: unknown };
        if (typeof body.playerId !== 'string' || typeof body.walletAddress !== 'string' || typeof body.nonce !== 'string' || typeof body.signature !== 'string') {
            return json({ error: 'playerId, walletAddress, nonce, and signature are required' }, 400);
        }
        try {
            const session = auth.verifyChallenge({ playerId: body.playerId, walletAddress: body.walletAddress, nonce: body.nonce, signature: body.signature });
            return json({ playerId: session.playerId, walletAddress: session.walletAddress, authenticatedAt: session.authenticatedAt });
        } catch (error) {
            return json({ error: error instanceof Error ? error.message : 'wallet verification failed' }, 401);
        }
    });
    return auth;
}

function json(payload: unknown, status = 200): Response {
    return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });
}
