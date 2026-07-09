import { createHash } from 'node:crypto';
import { InsufficientFundsError, SqliteCurrencyInventoryService, SqliteEventLedgerStorage, type CurrencyInventoryService, type EventLedgerStorage } from '../contracts/services.ts';
import { loadCosmeticCatalog, type CosmeticPackage } from '../cosmetics/registry.ts';
import type { CosmeticRarity } from '../contracts/cosmetic.ts';
import type { ModularRouter } from './router.ts';
import type { CosmeticNftService } from '../solana/interfaces.ts';
import type { WalletSession } from './wallet.ts';

export const LOOTBOX_BOX_ID = 'moon-crate';
export const LOOTBOX_PRICE = 100;
export const LOOTBOX_DUPLICATE_REFUND = 25;
export const LOOTBOX_ODDS: Readonly<Record<CosmeticRarity, number>> = Object.freeze({
    common: 0.7,
    rare: 0.2,
    epic: 0.08,
    legendary: 0.02,
});

export interface LootboxServices {
    currency: CurrencyInventoryService;
    ledger: EventLedgerStorage;
    walletAuth?: { sessionForPlayer(playerId: string): WalletSession | undefined };
    nft?: CosmeticNftService;
}

export interface LootboxRollResult {
    box: string;
    cost: number;
    seedCommitment: string;
    result: {
        cosmeticId: string;
        displayName: string;
        rarity: CosmeticRarity;
        slot: string;
        duplicate: boolean;
    };
    refund: number;
    balance: number;
}

export type RandomBytes = (length: number) => Uint8Array;

export function createLootboxServices(path?: string): LootboxServices {
    const ledger = new SqliteEventLedgerStorage(path ? { path } : {});
    const currency = new SqliteCurrencyInventoryService(path ? { path, ledger } : { ledger });
    return { currency, ledger };
}

export function registerLootboxModule<TConnection>(router: ModularRouter<TConnection>, services = createLootboxServices(), randomBytes: RandomBytes = secureRandomBytes): void {
    router.registerHttp('GET', '/lootbox/odds', () => jsonResponse(publicOddsPayload()));
    router.registerHttp('GET', '/api/lootbox/odds', () => jsonResponse(publicOddsPayload()));

    router.registerHttp('POST', '/lootbox/open', async (request) => {
        const body = await readJsonBody(request);
        const accountId = typeof body.accountId === 'string' ? body.accountId : '';
        const box = typeof body.box === 'string' && body.box.length > 0 ? body.box : LOOTBOX_BOX_ID;
        if (!accountId) return jsonResponse({ error: 'accountId is required' }, 400);
        if (box !== LOOTBOX_BOX_ID) return jsonResponse({ error: 'unknown lootbox' }, 404);

        try {
            return jsonResponse(await openLootbox(accountId, services, randomBytes));
        } catch (error) {
            if (error instanceof InsufficientFundsError) {
                return jsonResponse({ error: 'insufficient_funds', balance: error.balance, required: error.required }, 402);
            }
            if (error instanceof Error && error.message === 'lootbox catalog is empty') {
                return jsonResponse({ error: 'lootbox_unavailable' }, 503);
            }
            throw error;
        }
    });

    router.registerHttp('POST', '/api/lootbox/open', async (request) => {
        const body = await readJsonBody(request);
        const accountId = typeof body.accountId === 'string' ? body.accountId : '';
        const box = typeof body.box === 'string' && body.box.length > 0 ? body.box : LOOTBOX_BOX_ID;
        if (!accountId) return jsonResponse({ error: 'accountId is required' }, 400);
        if (box !== LOOTBOX_BOX_ID) return jsonResponse({ error: 'unknown lootbox' }, 404);

        try {
            return jsonResponse(await openLootbox(accountId, services, randomBytes));
        } catch (error) {
            if (error instanceof InsufficientFundsError) {
                return jsonResponse({ error: 'insufficient_funds', balance: error.balance, required: error.required }, 402);
            }
            if (error instanceof Error && error.message === 'lootbox catalog is empty') {
                return jsonResponse({ error: 'lootbox_unavailable' }, 503);
            }
            throw error;
        }
    });
}

export async function openLootbox(accountId: string, services: LootboxServices, randomBytes: RandomBytes = secureRandomBytes): Promise<LootboxRollResult> {
    const catalog = await loadCosmeticCatalog();
    if (catalog.length === 0) throw new Error('lootbox catalog is empty');

    const seed = randomBytes(32);
    const seedCommitment = createHash('sha256').update(seed).digest('hex');
    const rarity = rollRarity(seed);
    const item = pickCosmeticByRarity(catalog, rarity, seed);

    const balanceAfterSpend = await services.currency.spend(accountId, LOOTBOX_PRICE, `lootbox:${LOOTBOX_BOX_ID}`);
    const owned = new Set(await services.currency.listOwnedItems(accountId));
    const duplicate = owned.has(item.id);
    let balance = balanceAfterSpend;
    let refund = 0;

    if (duplicate) {
        refund = LOOTBOX_DUPLICATE_REFUND;
        balance = await services.currency.grant(accountId, refund, `lootbox_duplicate:${item.id}`);
    } else {
        await services.currency.grantOwnedItem(accountId, item.id, `lootbox:${LOOTBOX_BOX_ID}`);
        const wallet = services.walletAuth?.sessionForPlayer(accountId)?.walletAddress;
        if (wallet && services.nft) {
            const nft = await services.nft.mintCosmetic(wallet, item.id);
            await services.ledger.append({
                type: 'cosmetic_nft_minted',
                entityId: accountId,
                timestamp: new Date().toISOString(),
                payload: { source: 'lootbox', cosmeticId: item.id, walletAddress: wallet, ...nft },
            });
        }
    }

    const payload: LootboxRollResult = {
        box: LOOTBOX_BOX_ID,
        cost: LOOTBOX_PRICE,
        seedCommitment,
        result: {
            cosmeticId: item.id,
            displayName: item.manifest.displayName,
            rarity: item.definition.rarity,
            slot: item.definition.slot,
            duplicate,
        },
        refund,
        balance,
    };

    await services.ledger.append({ type: 'lootbox_roll', entityId: accountId, timestamp: new Date().toISOString(), payload });
    return payload;
}

export function publicOddsPayload() {
    return {
        box: LOOTBOX_BOX_ID,
        price: LOOTBOX_PRICE,
        duplicateRefund: LOOTBOX_DUPLICATE_REFUND,
        odds: LOOTBOX_ODDS,
    };
}

export function rollRarity(seed: Uint8Array): CosmeticRarity {
    const value = unitIntervalFromBytes(seed, 0);
    let cursor = 0;
    for (const rarity of ['common', 'rare', 'epic', 'legendary'] as const) {
        cursor += LOOTBOX_ODDS[rarity];
        if (value < cursor) return rarity;
    }
    return 'legendary';
}

function pickCosmeticByRarity(catalog: CosmeticPackage[], rarity: CosmeticRarity, seed: Uint8Array): CosmeticPackage {
    const pool = catalog.filter(item => item.definition.rarity === rarity);
    const candidates = pool.length > 0 ? pool : catalog;
    const index = Math.floor(unitIntervalFromBytes(seed, 8) * candidates.length);
    const chosen = candidates[Math.min(index, candidates.length - 1)];
    if (!chosen) throw new Error('lootbox catalog is empty');
    return chosen;
}

function unitIntervalFromBytes(bytes: Uint8Array, offset: number): number {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const hi = view.getUint32(offset);
    const lo = view.getUint32(offset + 4);
    return (hi * 0x100000000 + lo) / 0x10000000000000000;
}

function secureRandomBytes(length: number): Uint8Array {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return bytes;
}

async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
    try {
        const value = await request.json();
        return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
    } catch {
        return {};
    }
}

function jsonResponse(payload: unknown, status = 200): Response {
    return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
}
