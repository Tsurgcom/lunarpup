import { sha256Hex } from './sha256.ts';
import { fail, isRecord, ok, readArray, readEnum, readRecordOfStrings, readString, type ValidationResult, type Validator } from './validators.ts';

export const packageKinds = ['cosmetic', 'gamemode'] as const;
export type PackageKind = (typeof packageKinds)[number];

export interface AssetRef {
    name: string;
    uri: string;
    sha256: string;
    mediaType: string;
}

export interface PackageManifest {
    id: string;
    kind: PackageKind;
    version: string;
    author: string;
    displayName: string;
    assetRefs: AssetRef[];
    metadata?: Record<string, string>;
}

const sha256Pattern = /^[a-f0-9]{64}$/;

function canonicalize(value: unknown): string {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
    const entries = Object.entries(value as Record<string, unknown>)
        .filter(([, entryValue]) => entryValue !== undefined)
        .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${canonicalize(entryValue)}`).join(',')}}`;
}

export function canonicalManifestJson(manifest: Omit<PackageManifest, 'id'>): string {
    return canonicalize(manifest);
}

export function packageManifestId(manifest: Omit<PackageManifest, 'id'>): string {
    return sha256Hex(canonicalManifestJson(manifest));
}

const validateAssetRef: Validator<AssetRef> = (value, path = 'assetRefs[]') => {
    if (!isRecord(value)) return fail(`${path} must be an object`);
    const name = readString(value, 'name', `${path}.name`);
    if (!name.ok) return name;
    const uri = readString(value, 'uri', `${path}.uri`);
    if (!uri.ok) return uri;
    const sha256 = readString(value, 'sha256', `${path}.sha256`);
    if (!sha256.ok) return sha256;
    if (!sha256Pattern.test(sha256.value)) return fail(`${path}.sha256 must be 64 lowercase hex characters`);
    const mediaType = readString(value, 'mediaType', `${path}.mediaType`);
    if (!mediaType.ok) return mediaType;
    return ok({ name: name.value, uri: uri.value, sha256: sha256.value, mediaType: mediaType.value });
};

export function validatePackageManifest(value: unknown): ValidationResult<PackageManifest> {
    if (!isRecord(value)) return fail('package manifest must be an object');
    const id = readString(value, 'id');
    if (!id.ok) return id;
    if (!sha256Pattern.test(id.value)) return fail('id must be 64 lowercase hex characters');
    const kind = readEnum(value, 'kind', packageKinds);
    if (!kind.ok) return kind;
    const version = readString(value, 'version');
    if (!version.ok) return version;
    const author = readString(value, 'author');
    if (!author.ok) return author;
    const displayName = readString(value, 'displayName');
    if (!displayName.ok) return displayName;
    const assetRefs = readArray(value, 'assetRefs', validateAssetRef);
    if (!assetRefs.ok) return assetRefs;
    let metadata: Record<string, string> | undefined;
    if (value.metadata !== undefined) {
        const parsed = readRecordOfStrings(value, 'metadata');
        if (!parsed.ok) return parsed;
        metadata = parsed.value;
    }
    const withoutId: Omit<PackageManifest, 'id'> = { kind: kind.value, version: version.value, author: author.value, displayName: displayName.value, assetRefs: assetRefs.value, metadata };
    const expectedId = packageManifestId(withoutId);
    if (id.value !== expectedId) return fail(`id must be sha256 of canonical manifest JSON (${expectedId})`);
    return ok({ id: id.value, ...withoutId });
}
