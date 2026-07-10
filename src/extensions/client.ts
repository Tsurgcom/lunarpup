import { getApiBaseUrl } from '../net/protocol.ts';

interface ExtensionListing {
    extensions?: Array<{ name: string; clientModule?: string }>;
}

export interface ClientExtensionContext {
    hudRoot: HTMLElement;
    transientRoot: HTMLElement;
    signal: AbortSignal;
}

export type ClientExtensionCleanup = () => void;

interface ClientExtensionModule {
    setupClient?: (
        context: ClientExtensionContext,
    ) => void | ClientExtensionCleanup | Promise<void | ClientExtensionCleanup>;
}

interface DiscoveredExtension {
    name: string;
    module: ClientExtensionModule;
}

function entryUrl(clientModule: string, apiBase: string): string {
    return new URL(clientModule, apiBase || window.location.origin).href;
}

let discoveryPromise: Promise<DiscoveredExtension[]> | null = null;

async function discoverExtensions(): Promise<DiscoveredExtension[]> {
    const apiBase = getApiBaseUrl();
    const response = await fetch(`${apiBase}/extensions`);
    if (response.status === 404) return [];
    if (!response.ok) throw new Error(`extension listing failed ${response.status}`);
    const listing = await response.json() as ExtensionListing;
    const discovered: DiscoveredExtension[] = [];
    for (const extension of listing.extensions ?? []) {
        if (!extension.clientModule) continue;
        try {
            const module = await import(entryUrl(extension.clientModule, apiBase)) as ClientExtensionModule;
            if (typeof module.setupClient !== 'function') {
                throw new Error(`extension ${extension.name} clientModule must export setupClient(context)`);
            }
            discovered.push({ name: extension.name, module });
        } catch (error) {
            console.warn(`[extensions] ${extension.name} failed to load:`, error);
        }
    }
    return discovered;
}

function discoveredExtensions(): Promise<DiscoveredExtension[]> {
    discoveryPromise ??= discoverExtensions().catch(error => {
        discoveryPromise = null;
        throw error;
    });
    return discoveryPromise;
}

/**
 * Mount enabled clients only into shell-owned roots. Every successful setup
 * must return a cleanup when it owns listeners, timers, sockets, or DOM.
 */
export async function setupExtensions(context: ClientExtensionContext): Promise<ClientExtensionCleanup> {
    const cleanups: ClientExtensionCleanup[] = [];
    let disposed = false;
    const dispose = () => {
        if (disposed) return;
        disposed = true;
        for (const cleanup of cleanups.splice(0).reverse()) cleanup();
    };

    for (const extension of await discoveredExtensions()) {
        if (context.signal.aborted) break;
        try {
            const cleanup = await extension.module.setupClient?.(context);
            if (typeof cleanup === 'function') {
                if (context.signal.aborted || disposed) cleanup();
                else cleanups.push(cleanup);
            }
        } catch (error) {
            console.warn(`[extensions] ${extension.name} failed to start:`, error);
        }
    }

    if (context.signal.aborted) dispose();
    return dispose;
}
