import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCosmeticsServices, registerCosmeticsModule } from './cosmetics.ts';
import { registerLeaderboardModule } from './leaderboard.ts';
import { openLootbox, type LootboxServices } from './lootbox.ts';
import { ModularRouter } from './router.ts';
import type { CurrencyInventoryService } from '../contracts/services.ts';
import type { CosmeticNftService, SplTokenService } from '../solana/interfaces.ts';

class MockTokenService implements SplTokenService {
    readonly mintAddress = 'DevnetMint111111111111111111111111111111111';
    private readonly balances = new Map<string, number>();

    setBalance(wallet: string, amount: number): void {
        this.balances.set(wallet, amount);
    }

    getBalance(wallet: string): number {
        return this.balances.get(wallet) ?? 0;
    }

    grant(wallet: string, amount: number): number {
        const next = this.getBalance(wallet) + amount;
        this.balances.set(wallet, next);
        return next;
    }

    spend(wallet: string, amount: number): number {
        const balance = this.getBalance(wallet);
        if (balance < amount) throw new Error('token balance too low');
        const next = balance - amount;
        this.balances.set(wallet, next);
        return next;
    }

    listOwnedItems(): string[] { return []; }
    grantOwnedItem(): void { }
    async mintToWallet(wallet: string, amount: number) { return { mintAddress: this.mintAddress, signature: `mint-${wallet}-${amount}` }; }
    async transferBetweenWallets() { return { signature: 'transfer', sourceTokenAccount: 'source', destinationTokenAccount: 'destination' }; }
}

class MockNftService implements CosmeticNftService {
    readonly mints: Array<{ wallet: string; cosmeticId: string }> = [];

    async mintCosmetic(walletAddress: string, cosmeticPackageId: string) {
        this.mints.push({ wallet: walletAddress, cosmeticId: cosmeticPackageId });
        return { mintAddress: `mint-${this.mints.length}`, signature: `sig-${this.mints.length}`, metadataUri: `lunarpup://cosmetic/${cosmeticPackageId}?cosmeticPackageId=${cosmeticPackageId}`, cosmeticPackageId };
    }

    async grantOwnedCosmetics(accountId: string, walletAddress: string): Promise<string[]> {
        return this.mints.filter(mint => mint.wallet === walletAddress).map(mint => mint.cosmeticId).sort();
    }
}

const walletAuth = {
    sessionForPlayer(playerId: string) {
        return playerId === 'acct-token' ? { playerId, walletAddress: 'wallet-token', authenticatedAt: new Date(0).toISOString() } : undefined;
    },
};

describe('final integration pass', () => {
    test('cosmetics shop accepts linked wallet token and records NFT mint', async () => {
        const dbPath = tempDbPath();
        const services = createCosmeticsServices(dbPath);
        const token = new MockTokenService();
        token.setBalance('wallet-token', 1000);
        const nft = new MockNftService();
        const router = new ModularRouter<unknown>();
        registerCosmeticsModule(router, { ...services, walletAuth, token, nft });

        const catalogResponse = await route(router, new Request('http://localhost/api/cosmetics/catalog'));
        const catalog = await catalogResponse.json() as { catalog: Array<{ id: string; price: number }> };
        const item = catalog.catalog.find(entry => entry.price > 0) ?? catalog.catalog[0]!;

        const buyResponse = await route(router, jsonRequest('http://localhost/api/cosmetics/buy', { accountId: 'acct-token', cosmeticId: item.id, currency: 'token' }));
        expect(buyResponse.status).toBe(200);
        const payload = await buyResponse.json() as { ownedIds: string[]; tokenBalance: number | null; walletAddress: string | null };
        expect(payload.ownedIds).toContain(item.id);
        expect(payload.walletAddress).toBe('wallet-token');
        expect(payload.tokenBalance).toBe(1000 - item.price);
        expect(nft.mints).toEqual([{ wallet: 'wallet-token', cosmeticId: item.id }]);
        expect((await services.ledger.query({ type: 'cosmetic_nft_minted', entityId: 'acct-token' })).length).toBe(1);
        cleanupDb(dbPath);
    });

    test('wallet-linked lootbox wins mint an NFT and append economy ledger facts', async () => {
        const dbPath = tempDbPath();
        const services = createCosmeticsServices(dbPath);
        services.currency.grant('acct-token', 1000, 'test funds');
        const nft = new MockNftService();
        const lootboxServices: LootboxServices = { currency: services.currency, ledger: services.ledger, walletAuth, nft };
        const result = await openLootbox('acct-token', lootboxServices, () => new Uint8Array(32));
        expect(result.result.duplicate).toBe(false);
        expect(nft.mints).toEqual([{ wallet: 'wallet-token', cosmeticId: result.result.cosmeticId }]);
        expect(await services.ledger.query({ type: 'item_granted', entityId: 'acct-token' })).toHaveLength(1);
        expect(await services.ledger.query({ type: 'cosmetic_nft_minted', entityId: 'acct-token' })).toHaveLength(1);
        cleanupDb(dbPath);
    });

    test('leaderboard endpoint labels client-claimed finish times as untrusted telemetry', async () => {
        const dbPath = tempDbPath();
        const services = createCosmeticsServices(dbPath);
        await services.ledger.append({ type: 'gamemode_run_sample', entityId: 'race:pup-a', timestamp: '2026-01-01T00:00:00.000Z', payload: { gamemodeId: 'race', playerId: 'pup-a', reason: 'finish', samples: [{ t: 1200 }] } });
        await services.ledger.append({ type: 'gamemode_run_sample', entityId: 'race:pup-a', timestamp: '2026-01-01T00:01:00.000Z', payload: { gamemodeId: 'race', playerId: 'pup-a', reason: 'finish', samples: [{ t: 900 }] } });
        await services.ledger.append({ type: 'gamemode_run_sample', entityId: 'race:pup-b', timestamp: '2026-01-01T00:02:00.000Z', payload: { gamemodeId: 'race', playerId: 'pup-b', reason: 'finish', samples: [{ t: 1000 }] } });
        const router = new ModularRouter<unknown>();
        registerLeaderboardModule(router, { ledger: services.ledger });

        const response = await route(router, new Request('http://localhost/leaderboard/race'));
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            gamemodeId: 'race',
            trust: 'untrusted_client_telemetry',
            rewardEligible: false,
            rankedEligible: false,
            entries: [
                { playerId: 'pup-a', bestTimeMs: 900, completedAt: '2026-01-01T00:01:00.000Z' },
                { playerId: 'pup-b', bestTimeMs: 1000, completedAt: '2026-01-01T00:02:00.000Z' },
            ],
        });
        cleanupDb(dbPath);
    });
});

async function route(router: ModularRouter<unknown>, request: Request): Promise<Response> {
    const response = await router.handleHttp(request, { server: {} as never, upgrade: () => false });
    if (!response) throw new Error('route was not handled');
    return response;
}

function jsonRequest(url: string, body: Record<string, string>): Request {
    return new Request(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
}

function tempDbPath(): string {
    return join(mkdtempSync(join(tmpdir(), 'lunarpup-integration-')), 'test.db');
}

function cleanupDb(path: string): void {
    rmSync(path.slice(0, path.lastIndexOf('/')), { recursive: true, force: true });
}
