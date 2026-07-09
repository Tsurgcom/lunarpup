import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, join, normalize, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validatePackageManifest } from '../contracts/packageManifest.ts';
import type { PackageManifest } from '../contracts/packageManifest.ts';
import type { StorageServices } from '../contracts/services.ts';
import type { PlayerConnection } from '../server/multiplayer.ts';
import type { ModularRouter } from '../server/router.ts';

export interface EnabledExtension {
    name: string;
    manifest: PackageManifest;
    rootDir: string;
    clientUrl?: string;
}

export interface ExtensionServerContext {
    storage: StorageServices;
}

interface ServerExtensionModule {
    registerServer?: (router: ModularRouter<PlayerConnection>, context: ExtensionServerContext) => void | Promise<void>;
}

const EXTENSIONS_ROOT = resolve('content/extensions');

function enabledExtensionNames(): string[] {
    return (process.env.EXTENSIONS ?? '')
        .split(',')
        .map(name => name.trim())
        .filter(Boolean);
}

function safeExtensionDir(name: string): string | null {
    if (!/^[a-z0-9][a-z0-9-]*$/i.test(name)) return null;
    const dir = resolve(EXTENSIONS_ROOT, name);
    return dir.startsWith(EXTENSIONS_ROOT) ? dir : null;
}

function safeEntryPath(rootDir: string, entry: string): string | null {
    const normalized = normalize(entry).replace(/^[/\\]+/, '');
    const file = resolve(rootDir, normalized);
    return file.startsWith(rootDir) ? file : null;
}

function clientUrlFor(name: string, entry: string): string {
    return `/extensions/${encodeURIComponent(name)}/${encodeURIComponent(basename(entry))}`;
}

export async function loadEnabledExtensions(router: ModularRouter<PlayerConnection>, context: ExtensionServerContext): Promise<EnabledExtension[]> {
    const enabled: EnabledExtension[] = [];
    for (const name of enabledExtensionNames()) {
        const rootDir = safeExtensionDir(name);
        if (!rootDir || !existsSync(rootDir)) continue;
        const manifestPath = join(rootDir, 'manifest.json');
        const parsed = validatePackageManifest(JSON.parse(await readFile(manifestPath, 'utf8')));
        if (!parsed.ok) throw new Error(`invalid extension manifest ${name}: ${parsed.error}`);
        const manifest = parsed.value;
        if (manifest.kind !== 'extension') throw new Error(`enabled package ${name} is ${manifest.kind}, not extension`);

        if (manifest.serverModule) {
            const serverPath = safeEntryPath(rootDir, manifest.serverModule);
            if (!serverPath) throw new Error(`extension ${name} serverModule escapes package root`);
            // Extension modules are package-selected at runtime by EXTENSIONS.
            const mod = await import(pathToFileURL(serverPath).href) as ServerExtensionModule;
            if (typeof mod.registerServer !== 'function') throw new Error(`extension ${name} serverModule must export registerServer(router)`);
            await mod.registerServer(router, context);
        }

        enabled.push({
            name,
            manifest,
            rootDir,
            clientUrl: manifest.clientModule ? clientUrlFor(name, manifest.clientModule) : undefined,
        });
    }

    if (enabled.length === 0) return enabled;

    router.registerHttp('GET', '/extensions', () => new Response(JSON.stringify({
        extensions: enabled
            .filter(extension => extension.clientUrl)
            .map(extension => ({ name: extension.name, displayName: extension.manifest.displayName, clientModule: extension.clientUrl })),
    }), { headers: { 'Content-Type': 'application/json' } }));

    for (const extension of enabled) {
        const entry = extension.manifest.clientModule;
        if (!entry || !extension.clientUrl) continue;
        const clientPath = safeEntryPath(extension.rootDir, entry);
        if (!clientPath) throw new Error(`extension ${extension.name} clientModule escapes package root`);
        const routePath = new URL(`http://localhost${extension.clientUrl}`).pathname;
        router.registerHttp('GET', routePath, async () => new Response(await readFile(clientPath), {
            headers: { 'Content-Type': 'text/javascript; charset=utf-8' },
        }));
    }

    return enabled;
}
