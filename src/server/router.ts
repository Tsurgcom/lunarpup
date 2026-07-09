import type { Server, ServerWebSocket } from 'bun';

export interface HttpRouteContext<TConnection> {
    server: Server<TConnection>;
    upgrade: (data?: TConnection) => boolean;
}

export type HttpRouteHandler<TConnection> = (request: Request, context: HttpRouteContext<TConnection>) => Response | Promise<Response> | undefined | Promise<undefined>;
export type WebSocketHandler<TConnection> = (ws: ServerWebSocket<TConnection>, payload: unknown) => void;

export interface WebSocketEnvelope {
    channel?: string;
    type?: string;
    [key: string]: unknown;
}

export class ModularRouter<TConnection> {
    private readonly httpRoutes: Array<{ method: string; path: string; handler: HttpRouteHandler<TConnection> }> = [];
    private readonly wsHandlers = new Map<string, WebSocketHandler<TConnection>>();

    registerHttp(method: string, path: string, handler: HttpRouteHandler<TConnection>): void {
        this.httpRoutes.push({ method: method.toUpperCase(), path, handler });
    }

    registerWebSocket(channel: string, handler: WebSocketHandler<TConnection>): void {
        this.wsHandlers.set(channel, handler);
    }

    async handleHttp(request: Request, context: HttpRouteContext<TConnection>): Promise<Response | undefined> {
        const url = new URL(request.url);
        for (const route of this.httpRoutes) {
            if (route.method !== request.method.toUpperCase()) continue;
            const params = matchPath(route.path, url.pathname);
            if (!params) continue;
            if (params.size > 0) {
                Reflect.set(request, 'params', Object.fromEntries(params));
            }
            return await route.handler(request, context);
        }
        return undefined;
    }

    dispatchWebSocket(ws: ServerWebSocket<TConnection>, payload: unknown): boolean {
        const channel = this.channelFor(payload);
        const handler = this.wsHandlers.get(channel);
        if (!handler) return false;
        handler(ws, payload);
        return true;
    }

    private channelFor(payload: unknown): string {
        if (payload && typeof payload === 'object' && 'channel' in payload) {
            const channel = (payload as WebSocketEnvelope).channel;
            if (typeof channel === 'string' && channel.length > 0) return channel;
        }
        return 'multiplayer';
    }
}

function matchPath(pattern: string, pathname: string): Map<string, string> | null {
    if (pattern === pathname) return new Map();
    const patternParts = pattern.split('/').filter(Boolean);
    const pathParts = pathname.split('/').filter(Boolean);
    if (patternParts.length !== pathParts.length) return null;
    const params = new Map<string, string>();
    for (let i = 0; i < patternParts.length; i += 1) {
        const expected = patternParts[i]!;
        const actual = pathParts[i]!;
        if (expected.startsWith(':')) {
            params.set(expected.slice(1), decodeURIComponent(actual));
            continue;
        }
        if (expected !== actual) return null;
    }
    return params;
}
