import type { Config, Context } from '@netlify/functions';
import {
    joinRoom,
    leaveRoom,
    updatePlayerState,
    appendChat,
    RoomFullError,
    RoomCapError,
} from '../lib/room-store.ts';
import { corsHeaders, isCorsAllowed } from '../lib/cors.ts';
import { assertSessionSecret, issueSessionToken, verifySessionToken } from '../lib/session.ts';
import type { ClientMessage } from '../lib/protocol.ts';

type AuthedClientMessage = ClientMessage & { id?: string; token?: string };

export default async (req: Request, _context: Context) => {
    const headers = corsHeaders(req);

    if (req.method === 'OPTIONS') {
        if (!isCorsAllowed(req)) {
            return new Response('Forbidden', { status: 403 });
        }
        return new Response(null, { status: 204, headers });
    }

    if (req.method !== 'POST') {
        return new Response('Method not allowed', { status: 405, headers });
    }

    if (!isCorsAllowed(req)) {
        return Response.json({ error: 'Forbidden origin' }, { status: 403, headers });
    }

    let msg: AuthedClientMessage;
    try {
        msg = await req.json() as AuthedClientMessage;
    } catch {
        return Response.json({ error: 'Invalid JSON' }, { status: 400, headers });
    }

    if (!msg || typeof msg !== 'object' || !('type' in msg)) {
        return Response.json({ error: 'Invalid message' }, { status: 400, headers });
    }

    try {
        switch (msg.type) {
            case 'join': {
                if (typeof msg.room !== 'string') {
                    return Response.json({ error: 'Missing or invalid room' }, { status: 400, headers });
                }
                // Fail closed BEFORE the first storage write: an unconfigured production
                // deploy must not create billable room/player blobs and then 500.
                assertSessionSecret();
                const result = await joinRoom(msg.room, msg.name, msg.state);
                const token = await issueSessionToken(result.room, result.id);
                return Response.json({
                    type: 'welcome',
                    id: result.id,
                    color: result.color,
                    room: result.room,
                    players: result.players,
                    token,
                }, { headers });
            }
            case 'state': {
                const id = msg.id;
                const token = msg.token;
                if (!msg.room) {
                    return Response.json({ error: 'Missing room' }, { status: 400, headers });
                }
                if (!id || !token) {
                    return Response.json({ error: 'Missing player id or session token' }, { status: 400, headers });
                }
                if (!await verifySessionToken(token, msg.room, id)) {
                    return Response.json({ error: 'Invalid session' }, { status: 403, headers });
                }
                const ok = await updatePlayerState(msg.room, id, msg.seq, msg.state);
                return Response.json({ ok }, { status: ok ? 200 : 404, headers });
            }
            case 'leave': {
                const id = msg.id;
                const token = msg.token;
                if (!msg.room) {
                    return Response.json({ error: 'Missing room' }, { status: 400, headers });
                }
                if (!id || !token) {
                    return Response.json({ error: 'Missing player id or session token' }, { status: 400, headers });
                }
                if (!await verifySessionToken(token, msg.room, id)) {
                    return Response.json({ error: 'Invalid session' }, { status: 403, headers });
                }
                const ok = await leaveRoom(msg.room, id);
                return Response.json({ ok }, { status: ok ? 200 : 404, headers });
            }
            case 'chat': {
                const id = msg.id;
                const token = msg.token;
                if (!msg.room) {
                    return Response.json({ error: 'Missing room' }, { status: 400, headers });
                }
                if (!id || !token) {
                    return Response.json({ error: 'Missing player id or session token' }, { status: 400, headers });
                }
                if (!await verifySessionToken(token, msg.room, id)) {
                    return Response.json({ error: 'Invalid session' }, { status: 403, headers });
                }
                const chat = await appendChat(msg.room, id, msg.payload);
                if (!chat) {
                    return Response.json({ error: 'Player not in room' }, { status: 404, headers });
                }
                return Response.json({ ok: true, chat }, { headers });
            }
            default:
                return Response.json({ error: 'Unknown message type' }, { status: 400, headers });
        }
    } catch (err) {
        if (err instanceof RoomFullError) {
            return Response.json({ error: err.message }, { status: 409, headers });
        }
        if (err instanceof RoomCapError) {
            return Response.json({ error: err.message }, { status: 503, headers });
        }
        console.error('[mp]', err);
        return Response.json({ error: 'Server error' }, { status: 500, headers });
    }
};

export const config: Config = {
    path: '/api/mp',
};
