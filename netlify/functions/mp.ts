import type { Config, Context } from '@netlify/functions';
import { joinRoom, leaveRoom, updatePlayerState, appendChat, RoomFullError } from '../lib/room-store.ts';
import type { ClientMessage } from '../lib/protocol.ts';

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};

export default async (req: Request, _context: Context) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: CORS });
    }

    if (req.method !== 'POST') {
        return new Response('Method not allowed', { status: 405, headers: CORS });
    }

    let msg: ClientMessage & { id?: string };
    try {
        msg = await req.json() as ClientMessage & { id?: string };
    } catch {
        return Response.json({ error: 'Invalid JSON' }, { status: 400, headers: CORS });
    }

    if (!msg || typeof msg !== 'object' || !('type' in msg)) {
        return Response.json({ error: 'Invalid message' }, { status: 400, headers: CORS });
    }

    try {
        switch (msg.type) {
            case 'join': {
                const result = await joinRoom(msg.room, msg.name);
                return Response.json({
                    type: 'welcome',
                    id: result.id,
                    color: result.color,
                    room: result.room,
                    players: result.players,
                }, { headers: CORS });
            }
            case 'state': {
                const id = msg.id;
                if (!id) {
                    return Response.json({ error: 'Missing player id' }, { status: 400, headers: CORS });
                }
                const ok = await updatePlayerState(msg.room, id, msg.state);
                return Response.json({ ok }, { status: ok ? 200 : 404, headers: CORS });
            }
            case 'leave': {
                const id = msg.id;
                if (!id) {
                    return Response.json({ error: 'Missing player id' }, { status: 400, headers: CORS });
                }
                const ok = await leaveRoom(msg.room, id);
                return Response.json({ ok }, { status: ok ? 200 : 404, headers: CORS });
            }
            case 'chat': {
                const id = msg.id;
                if (!id) {
                    return Response.json({ error: 'Missing player id' }, { status: 400, headers: CORS });
                }
                const chat = await appendChat(msg.room, id, msg.text);
                if (!chat) {
                    return Response.json({ error: 'Player not in room' }, { status: 404, headers: CORS });
                }
                return Response.json({ ok: true, chat }, { headers: CORS });
            }
            default:
                return Response.json({ error: 'Unknown message type' }, { status: 400, headers: CORS });
        }
    } catch (err) {
        if (err instanceof RoomFullError) {
            return Response.json({ error: err.message }, { status: 409, headers: CORS });
        }
        console.error('[mp]', err);
        return Response.json({ error: 'Server error' }, { status: 500, headers: CORS });
    }
};

export const config: Config = {
    path: '/api/mp',
};
