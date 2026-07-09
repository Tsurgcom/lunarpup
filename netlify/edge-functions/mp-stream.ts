import type { Config, Context } from '@netlify/edge-functions';
import { POLL_MS, readRoomSnapshots, readChatSince } from '../lib/room-store.ts';
import type { ServerMessage } from '../lib/protocol.ts';

export default async (request: Request, _context: Context) => {
    const url = new URL(request.url);
    const room = url.searchParams.get('room')?.trim();
    const playerId = url.searchParams.get('id')?.trim();

    if (!room || !playerId) {
        return new Response('Missing room or id', { status: 400 });
    }

    const encoder = new TextEncoder();
    const knownPlayers = new Map<string, { name: unknown; color: number }>();
    const lastSeq = new Map<string, number>();
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
                                lastSeq.set(id, snap.seq);
                            }
                        }
                    }

                    for (const id of [...knownPlayers.keys()]) {
                        if (!activeIds.has(id) || id === playerId) {
                            knownPlayers.delete(id);
                            lastSeq.delete(id);
                            send({ type: 'player_left', id });
                        }
                    }

                    // Dedupe on the opaque client-supplied `seq` counter — the
                    // relay never inspects the (encrypted) state payload itself.
                    for (const snap of snapshots) {
                        const prev = lastSeq.get(snap.id);
                        if (prev === snap.seq) continue;
                        lastSeq.set(snap.id, snap.seq);
                        send({ type: 'state', id: snap.id, seq: snap.seq, state: snap.state });
                    }

                    const chats = await readChatSince(room, lastChatTs);
                    for (const chat of chats) {
                        lastChatTs = Math.max(lastChatTs, chat.ts);
                        send({ type: 'chat', id: chat.id, ts: chat.ts, payload: chat.payload });
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
