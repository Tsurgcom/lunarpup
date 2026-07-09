import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { packageManifestId, type PackageManifest } from '../contracts/packageManifest.ts';
import { loadCosmeticPackage } from '../cosmetics/registry.ts';
import { createCosmeticsServices, equippedFor, registerCosmeticsModule } from './cosmetics.ts';
import { ModularRouter } from './router.ts';

const cleanupPaths: string[] = [];

afterEach(() => {
    for (const path of cleanupPaths.splice(0)) {
        if (existsSync(path)) rmSync(path, { recursive: true, force: true });
    }
});

describe('cosmetic package loader', () => {
    test('rejects manifest content-address tampering', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'lunarpup-cosmetic-'));
        cleanupPaths.push(dir);
        const definition = '{"id":"tamper-board","rarity":"common","slot":"board","visual":{"colors":["#ffffff"]}}';
        const manifestWithoutId: Omit<PackageManifest, 'id'> = {
            kind: 'cosmetic',
            version: '1.0.0',
            author: 'Test',
            displayName: 'Tamper Board',
            assetRefs: [{ name: 'definition', uri: 'definition.json', sha256: await sha256(definition), mediaType: 'application/json' }],
            metadata: { price: '10' },
        };
        const manifest = { id: packageManifestId(manifestWithoutId), ...manifestWithoutId };
        writeFileSync(join(dir, 'definition.json'), definition);
        writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ ...manifest, displayName: 'Changed Name' }));

        await expect(loadCosmeticPackage(dir)).rejects.toThrow('id must be sha256 of canonical manifest JSON');
    });
});

describe('cosmetics server module', () => {
    test('buy, equip, and inventory round-trip through sqlite services', async () => {
        const dbPath = join(tmpdir(), `lunarpup-cosmetics-${crypto.randomUUID()}.db`);
        cleanupPaths.push(dbPath, `${dbPath}-shm`, `${dbPath}-wal`);
        const services = createCosmeticsServices(dbPath);
        services.currency.grant('acct-1', 1000, 'test funds');
        const router = new ModularRouter<unknown>();
        registerCosmeticsModule(router, services);

        const catalogResponse = await route(router, new Request('http://localhost/api/cosmetics/catalog'));
        expect(catalogResponse.status).toBe(200);
        const catalogPayload = await catalogResponse.json() as { catalog: Array<{ id: string; definition: { slot: string } }> };
        const board = catalogPayload.catalog.find(item => item.definition.slot === 'board');
        expect(board).toBeDefined();

        const buyResponse = await route(router, jsonRequest('http://localhost/api/cosmetics/buy', { accountId: 'acct-1', cosmeticId: board!.id }));
        expect(buyResponse.status).toBe(200);
        expect((await buyResponse.json() as { ownedIds: string[] }).ownedIds).toContain(board!.id);

        const equipResponse = await route(router, jsonRequest('http://localhost/api/cosmetics/equip', { accountId: 'acct-1', cosmeticId: board!.id, slot: 'board' }));
        expect(equipResponse.status).toBe(200);
        const equipPayload = await equipResponse.json() as { equipped: { board?: string }; ownedIds: string[] };
        expect(equipPayload.equipped.board).toBe(board!.id);
        expect(equipPayload.ownedIds).toContain(board!.id);
        expect(await equippedFor('acct-1', services.ledger)).toEqual({ board: board!.id });
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

async function sha256(source: string): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source));
    return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
