import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { validateCosmeticDefinition, type CosmeticDefinition, type CosmeticSlot } from '../contracts/cosmetic.ts';
import { validatePackageManifest, type PackageManifest } from '../contracts/packageManifest.ts';

export interface CosmeticPackage {
    id: string;
    manifest: PackageManifest;
    definition: CosmeticDefinition;
    price: number;
}

export interface EquippedCosmetics {
    board?: string;
    body?: string;
    trail?: string;
    aura?: string;
}

export const cosmeticContentDir = 'content/cosmetics';

const manifestFile = 'manifest.json';
const definitionAssetName = 'definition';

let cachedPackages: CosmeticPackage[] | null = null;

export function clearCosmeticRegistryCache(): void {
    cachedPackages = null;
}

export async function loadCosmeticCatalog(rootDir = cosmeticContentDir): Promise<CosmeticPackage[]> {
    if (rootDir === cosmeticContentDir && cachedPackages) return cachedPackages;

    const entries = await readdir(rootDir, { withFileTypes: true });
    const packages = await Promise.all(entries
        .filter(entry => entry.isDirectory())
        .map(entry => loadCosmeticPackage(join(rootDir, entry.name))));
    packages.sort((a, b) => a.definition.slot.localeCompare(b.definition.slot) || a.price - b.price || a.manifest.displayName.localeCompare(b.manifest.displayName));

    if (rootDir === cosmeticContentDir) cachedPackages = packages;
    return packages;
}

export async function loadCosmeticPackage(packageDir: string): Promise<CosmeticPackage> {
    const manifest = parseJson(await readFile(join(packageDir, manifestFile), 'utf8'), `${packageDir}/${manifestFile}`);
    const validatedManifest = validatePackageManifest(manifest);
    if (!validatedManifest.ok) throw new Error(`${packageDir}/${manifestFile}: ${validatedManifest.error}`);
    if (validatedManifest.value.kind !== 'cosmetic') throw new Error(`${packageDir}/${manifestFile}: kind must be cosmetic`);

    const definitionRef = validatedManifest.value.assetRefs.find(ref => ref.name === definitionAssetName);
    if (!definitionRef) throw new Error(`${packageDir}/${manifestFile}: missing definition asset ref`);
    if (definitionRef.uri.includes('://') || definitionRef.uri.startsWith('/') || definitionRef.uri.includes('..')) {
        throw new Error(`${packageDir}/${manifestFile}: definition asset must be a relative package file`);
    }

    const definitionJson = await readFile(join(packageDir, definitionRef.uri), 'utf8');
    const actualSha = createHash('sha256').update(definitionJson).digest('hex');
    if (actualSha !== definitionRef.sha256) {
        throw new Error(`${packageDir}/${definitionRef.uri}: sha256 mismatch (${actualSha})`);
    }

    const definitionResult = validateCosmeticDefinition(parseJson(definitionJson, `${packageDir}/${definitionRef.uri}`));
    if (!definitionResult.ok) throw new Error(`${packageDir}/${definitionRef.uri}: ${definitionResult.error}`);

    const price = Number(validatedManifest.value.metadata?.price ?? 0);
    if (!Number.isInteger(price) || price < 0) throw new Error(`${packageDir}/${manifestFile}: metadata.price must be a non-negative integer`);

    return {
        id: validatedManifest.value.id,
        manifest: validatedManifest.value,
        definition: { ...definitionResult.value, id: validatedManifest.value.id },
        price,
    };
}

export async function getCosmeticById(id: string, rootDir = cosmeticContentDir): Promise<CosmeticPackage | undefined> {
    return (await loadCosmeticCatalog(rootDir)).find(pkg => pkg.id === id);
}

export function sanitizeEquippedCosmetics(value: unknown): EquippedCosmetics {
    if (!value || typeof value !== 'object') return {};
    const record = value as Record<string, unknown>;
    const equipped: EquippedCosmetics = {};
    for (const slot of ['board', 'body', 'trail', 'aura'] as const) {
        if (typeof record[slot] === 'string' && record[slot].length > 0) equipped[slot] = record[slot] as string;
    }
    return equipped;
}

export function equippedWith(slot: CosmeticSlot, cosmeticId: string | null, current: EquippedCosmetics): EquippedCosmetics {
    const next = { ...current };
    if (cosmeticId) next[slot] = cosmeticId;
    else delete next[slot];
    return next;
}

function parseJson(source: string, label: string): unknown {
    try {
        return JSON.parse(source);
    } catch (error) {
        throw new Error(`${label}: invalid JSON (${error instanceof Error ? error.message : String(error)})`);
    }
}
