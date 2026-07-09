export function cosmeticMetadataUri(cosmeticPackageId: string): string {
    const encoded = encodeURIComponent(cosmeticPackageId);
    return `lunarpup://cosmetic/${encoded}?cosmeticPackageId=${encoded}`;
}

export function cosmeticPackageIdFromUri(uri: string): string | undefined {
    try {
        const parsed = new URL(uri);
        const fromQuery = parsed.searchParams.get('cosmeticPackageId');
        if (fromQuery) return fromQuery;
        if (parsed.protocol === 'lunarpup:' && parsed.hostname === 'cosmetic') return decodeURIComponent(parsed.pathname.replace(/^\//, ''));
    } catch {
        return undefined;
    }
    return undefined;
}
