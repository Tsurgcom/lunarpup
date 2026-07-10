import { getApiBaseUrl } from '../net/protocol.ts';

interface ExtensionListing {
    extensions?: Array<{ name: string; clientModule?: string }>;
}

interface ClientExtensionModule {
    setupClient?: () => void | Promise<void>;
}

function entryUrl(clientModule: string, apiBase: string): string {
    return new URL(clientModule, apiBase || window.location.origin).href;
}

export async function setupExtensions(): Promise<void> {
    const apiBase = getApiBaseUrl();
    const response = await fetch(`${apiBase}/extensions`);
    if (response.status === 404) return;
    if (!response.ok) throw new Error(`extension listing failed ${response.status}`);
    const listing = await response.json() as ExtensionListing;
    for (const extension of listing.extensions ?? []) {
        if (!extension.clientModule) continue;
        // A broken extension must never take down the game: isolate each one.
        try {
            // Extension client entries are server-provided at runtime, so static imports cannot name them.
            const mod = await import(entryUrl(extension.clientModule, apiBase)) as ClientExtensionModule;
            if (typeof mod.setupClient !== 'function') throw new Error(`extension ${extension.name} clientModule must export setupClient()`);
            await mod.setupClient();
        } catch (error) {
            console.warn(`[extensions] ${extension.name} failed to load:`, error);
        }
    }
}
