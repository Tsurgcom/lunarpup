import type { Config, Context } from '@netlify/edge-functions';
import { POLL_MS, readRoomSnapshots, readChatSince } from '../lib/room-store.ts';
import { verifySessionToken } from '../lib/session.ts';
import type { ServerMessage } from '../lib/protocol.ts';

export default async (request: Request, _context: Context) => {
    const url = new URL(request.url);
    const room = url.searchParams.get('room')?.trim();
    const playerId = url.searchParams.get('id')?.trim();
    const token = url.searchParams.get('token')?.trim();
    const sinceParam = url.searchParams.get('since');
    const sinceTs = sinceParam ? Number(sinceParam) : 0;

    if (!room || !playerId || !token) {
        return new Response('Missing room, id, or session token', { status: 400 });
    }

    if (!await verifySessionToken(token, room, playerId)) {
        return new Response('Invalid session', { status: 403 });
    }

    const encoder = new TextEncoder();
    const knownPlayers = new Map<string, { name: unknown; color: number }>();
    const lastSeq = new Map<string, number>();
    let lastChatTs = Number.isFinite(sinceTs) && sinceTs > 0 ? sinceTs : 0;

    const body = new ReadableStream({
        start(controller) {
            let closed = false;
            let keepalive: ReturnType<typeof setInterval> | null = null;
            let pollTimer: ReturnType<typeof setInterval> | null = null;

            const send = (msg: ServerMessage) => {
                if (closed) return;
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(msg)}\n\n`));
            };

            let close = () => {
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

                    // Membership revocation: once the viewer has left or been pruned from
                    // the room index, stop streaming (SEC review: a left/expired player
                    // must not keep reading room state indefinitely).
                    if (Object.keys(index.players).length > 0 && !activeIds.has(playerId)) {
                        send({ type: 'player_left', id: playerId });
                        close();
                        return;
                    }

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

            // Re-verify the session token periodically so an expired token can't keep a
            // stream open for its full lifetime (token TTL is an hour; the open-time
            // check alone would let it run that long). Closes the expiry half of the
            // one-shot-authorization finding.
            const reverify = setInterval(() => {
                void (async () => {
                    if (closed) return;
                    if (!await verifySessionToken(token, room, playerId)) close();
                })();
            }, 30_000);
            const baseClose = close;
            close = () => { clearInterval(reverify); baseClose(); };

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
