import { describe, expect, test } from 'bun:test';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { ModularRouter } from './router.ts';
import { WalletAuthService, registerWalletModule } from './wallet.ts';

function testWallet() {
    const keypair = nacl.sign.keyPair();
    return { address: bs58.encode(keypair.publicKey), secretKey: keypair.secretKey };
}

describe('WalletAuthService', () => {
    test('binds a signed challenge to player id and wallet address', () => {
        const keypair = testWallet();
        const auth = new WalletAuthService();
        const challenge = auth.createChallenge('player-1', keypair.address, Date.parse('2026-07-09T00:00:00.000Z'));
        const signature = Buffer.from(nacl.sign.detached(new TextEncoder().encode(challenge.message), keypair.secretKey)).toString('base64');

        const session = auth.verifyChallenge({ playerId: 'player-1', walletAddress: keypair.address, nonce: challenge.nonce, signature }, Date.parse('2026-07-09T00:01:00.000Z'));

        expect(session).toMatchObject({ playerId: 'player-1', walletAddress: keypair.address });
        expect(auth.sessionForPlayer('player-1')?.walletAddress).toBe(keypair.address);
    });

    test('rejects signatures for a different player binding', () => {
        const keypair = testWallet();
        const auth = new WalletAuthService();
        const challenge = auth.createChallenge('player-1', keypair.address, 0);
        const signature = Buffer.from(nacl.sign.detached(new TextEncoder().encode(challenge.message), keypair.secretKey)).toString('base64');

        expect(() => auth.verifyChallenge({ playerId: 'player-2', walletAddress: keypair.address, nonce: challenge.nonce, signature }, 1000)).toThrow('wallet challenge does not match');
    });

    test('registers challenge and verify HTTP routes', async () => {
        const keypair = testWallet();
        const router = new ModularRouter<unknown>();
        registerWalletModule(router);
        const challengeResponse = await router.handleHttp(new Request('http://localhost/wallet/challenge', {
            method: 'POST',
            body: JSON.stringify({ playerId: 'player-1', walletAddress: keypair.address }),
        }), { server: {} as never, upgrade: () => false });
        const challenge = await challengeResponse?.json() as { nonce: string; message: string };
        const signature = Buffer.from(nacl.sign.detached(new TextEncoder().encode(challenge.message), keypair.secretKey)).toString('base64');

        const verifyResponse = await router.handleHttp(new Request('http://localhost/wallet/verify', {
            method: 'POST',
            body: JSON.stringify({ playerId: 'player-1', walletAddress: keypair.address, nonce: challenge.nonce, signature }),
        }), { server: {} as never, upgrade: () => false });

        expect(challengeResponse?.status).toBe(200);
        expect(verifyResponse?.status).toBe(200);
        expect(await verifyResponse?.json()).toMatchObject({ playerId: 'player-1', walletAddress: keypair.address });
    });
});
