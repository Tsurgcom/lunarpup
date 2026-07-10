export function buildPrivateInviteUrl(currentHref: string): string | null {
    const url = new URL(currentHref);
    const key = new URLSearchParams(url.hash.replace(/^#/, '')).get('k')?.trim();
    if (!key) return null;

    url.searchParams.set('multiplayer', '');
    url.searchParams.delete('name');
    return url.href;
}
