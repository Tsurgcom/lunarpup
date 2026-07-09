import { InsufficientFundsError, SqliteCurrencyInventoryService, SqliteEventLedgerStorage, type CurrencyInventoryService, type EventLedgerStorage } from '../contracts/services.ts';
import { equippedWith, getCosmeticById, loadCosmeticCatalog, sanitizeEquippedCosmetics, type EquippedCosmetics } from '../cosmetics/registry.ts';
import type { CosmeticSlot } from '../contracts/cosmetic.ts';
import type { ModularRouter } from './router.ts';

interface CosmeticsServices {
    currency: CurrencyInventoryService;
    ledger: EventLedgerStorage;
}

export function createCosmeticsServices(path?: string): CosmeticsServices {
    const ledger = new SqliteEventLedgerStorage(path ? { path } : {});
    const currency = new SqliteCurrencyInventoryService(path ? { path, ledger } : { ledger });
    return { currency, ledger };
}

export function registerCosmeticsModule<TConnection>(router: ModularRouter<TConnection>, services = createCosmeticsServices()): void {
    router.registerHttp('GET', '/api/cosmetics/catalog', async () => jsonResponse({ catalog: await publicCatalog() }));

    router.registerHttp('GET', '/api/cosmetics/inventory', async (request) => {
        const accountId = accountFromRequest(request);
        if (!accountId) return jsonResponse({ error: 'accountId is required' }, 400);
        return jsonResponse(await inventoryPayload(accountId, services));
    });

    router.registerHttp('POST', '/api/cosmetics/buy', async (request) => {
        const body = await readJsonBody(request);
        const accountId = typeof body.accountId === 'string' ? body.accountId : '';
        const cosmeticId = typeof body.cosmeticId === 'string' ? body.cosmeticId : '';
        if (!accountId || !cosmeticId) return jsonResponse({ error: 'accountId and cosmeticId are required' }, 400);

        const cosmetic = await getCosmeticById(cosmeticId);
        if (!cosmetic) return jsonResponse({ error: 'unknown cosmetic' }, 404);

        const owned = new Set(await services.currency.listOwnedItems(accountId));
        if (!owned.has(cosmetic.id)) {
            try {
                if (cosmetic.price > 0) services.currency.spend(accountId, cosmetic.price, `buy:${cosmetic.id}`);
                services.currency.grantOwnedItem(accountId, cosmetic.id, 'cosmetic purchase');
            } catch (error) {
                if (error instanceof InsufficientFundsError) {
                    return jsonResponse({ error: 'insufficient_funds', balance: error.balance, required: error.required }, 402);
                }
                throw error;
            }
        }

        return jsonResponse(await inventoryPayload(accountId, services));
    });

    router.registerHttp('POST', '/api/cosmetics/equip', async (request) => {
        const body = await readJsonBody(request);
        const accountId = typeof body.accountId === 'string' ? body.accountId : '';
        const cosmeticId = body.cosmeticId === null ? null : typeof body.cosmeticId === 'string' ? body.cosmeticId : '';
        const slot = typeof body.slot === 'string' ? body.slot : '';
        if (!accountId || !isCosmeticSlot(slot) || cosmeticId === '') return jsonResponse({ error: 'accountId, slot, and cosmeticId are required' }, 400);

        let next = await equippedFor(accountId, services.ledger);
        if (cosmeticId) {
            const cosmetic = await getCosmeticById(cosmeticId);
            if (!cosmetic) return jsonResponse({ error: 'unknown cosmetic' }, 404);
            if (cosmetic.definition.slot !== slot) return jsonResponse({ error: 'cosmetic does not fit slot' }, 400);
            const owned = new Set(await services.currency.listOwnedItems(accountId));
            if (!owned.has(cosmetic.id)) return jsonResponse({ error: 'cosmetic not owned' }, 403);
        }

        next = equippedWith(slot, cosmeticId, next);
        services.ledger.append({ type: 'cosmetics_equipped', entityId: accountId, timestamp: new Date().toISOString(), payload: next });
        return jsonResponse(await inventoryPayload(accountId, services));
    });
}

export async function equippedFor(accountId: string, ledger: EventLedgerStorage): Promise<EquippedCosmetics> {
    const events = await ledger.query({ type: 'cosmetics_equipped', entityId: accountId });
    const last = events.at(-1);
    return sanitizeEquippedCosmetics(last?.payload);
}

async function publicCatalog() {
    return (await loadCosmeticCatalog()).map(pkg => ({
        id: pkg.id,
        manifest: pkg.manifest,
        definition: pkg.definition,
        price: pkg.price,
    }));
}

async function inventoryPayload(accountId: string, services: CosmeticsServices) {
    const [catalog, ownedIds, balance, equipped] = await Promise.all([
        publicCatalog(),
        services.currency.listOwnedItems(accountId),
        services.currency.getBalance(accountId),
        equippedFor(accountId, services.ledger),
    ]);
    return { accountId, balance, ownedIds, equipped, catalog };
}

function accountFromRequest(request: Request): string {
    const url = new URL(request.url);
    return url.searchParams.get('accountId') ?? '';
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

function isCosmeticSlot(value: string): value is CosmeticSlot {
    return value === 'board' || value === 'body' || value === 'trail' || value === 'aura';
}
