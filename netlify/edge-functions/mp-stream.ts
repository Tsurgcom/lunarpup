import type { Config, Context } from '@netlify/edge-functions';
import { POLL_MS, readRoomSnapshots, stateFingerprint, readChatSince } from '../lib/room-store.ts';
import type { ServerMessage } from '../lib/protocol.ts';

export default async (request: Request, _context: Context) => {
    const url = new URL(request.url);
    const room = url.searchParams.get('room')?.trim();
    const playerId = url.searchParams.get('id')?.trim();

    if (!room || !playerId) {
        return new Response('Missing room or id', { status: 400 });
    }

    const encoder = new TextEncoder();
    const knownPlayers = new Map<string, { name: string; color: number }>();
    const lastFingerprints = new Map<string, string>();
    let lastChatTs = 0;

    const body = new ReadableStream({
        start(controller) {
            let closed = false;
            let keepalive: ReturnType<typeof setInterval> | null = null;
            let pollTimer: ReturnType<typeof setInterval> | null = null;

            const send = (msg: ServerMessage) => {
                if (closed) return;
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(msg)}\n\n`));
            };

            const close = () => {
                if (closed) return;
                closed = true;
                if (keepalive) clearInterval(keepalive);
                if (pollTimer) clearInterval(pollTimer);
                try { controller.close(); } catch { /* already closed */ }
            };

            const poll = async () => {
                if (closed) return;
                try {
                    const { index, snapshots } = await readRoomSnapshots(room, playerId);
                    const activeIds = new Set(Object.keys(index.players));

                    for (const [id, meta] of Object.entries(index.players)) {
                        if (id === playerId) continue;
                        if (!knownPlayers.has(id)) {
                            knownPlayers.set(id, meta);
                            const snap = snapshots.find(s => s.id === id);
                            if (snap) {
                                send({ type: 'player_joined', player: snap });
                                lastFingerprints.set(id, stateFingerprint(snap));
                            }
                        }
                    }

                    for (const id of [...knownPlayers.keys()]) {
                        if (!activeIds.has(id) || id === playerId) {
                            knownPlayers.delete(id);
                            lastFingerprints.delete(id);
                            send({ type: 'player_left', id });
                        }
                    }

                    for (const snap of snapshots) {
                        const fp = stateFingerprint(snap);
                        const prev = lastFingerprints.get(snap.id);
                        if (prev === fp) continue;
                        lastFingerprints.set(snap.id, fp);
                        const { id, ...rest } = snap;
                        const { name: _n, color: _c, ...state } = rest;
                        send({ type: 'state', id, state });
                    }

                    const chats = await readChatSince(room, lastChatTs);
                    for (const chat of chats) {
                        lastChatTs = Math.max(lastChatTs, chat.ts);
                        send({ type: 'chat', ...chat });
                    }
                } catch (err) {
                    console.error('[mp-stream]', err);
                }
            };

            request.signal.addEventListener('abort', close);

            keepalive = setInterval(() => {
                if (closed) return;
                controller.enqueue(encoder.encode(': keepalive\n\n'));
            }, 15_000);

            pollTimer = setInterval(() => { void poll(); }, POLL_MS);
            void poll();
        },
    });

    return new Response(body, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
        },
    });
};

export const config: Config = {
    path: '/api/mp/stream',
};
