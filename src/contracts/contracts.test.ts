import { describe, expect, test } from 'bun:test';
import {
    packageManifestId,
    validateAgentEvent,
    validateCosmeticDefinition,
    validatePackageManifest,
    validateRoomClientMessage,
    validateRoomServerMessage,
    type AgentEvent,
    type CosmeticDefinition,
    type PackageManifest,
    type ValidationResult,
} from './index.ts';

function expectOk<T>(result: ValidationResult<T>): T {
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    return result.value;
}

function expectError<T>(result: ValidationResult<T>, error: string): void {
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected validation to fail');
    expect(result.error).toBe(error);
}

function validManifest(): PackageManifest {
    const withoutId: Omit<PackageManifest, 'id'> = {
        kind: 'cosmetic',
        version: '1.0.0',
        author: 'Moon Kennel',
        displayName: 'Comet Trail',
        assetRefs: [{
            name: 'trail',
            uri: 'ipfs://comet-trail',
            sha256: 'a'.repeat(64),
            mediaType: 'model/gltf+json',
        }],
        metadata: { license: 'CC0' },
    };
    return { id: packageManifestId(withoutId), ...withoutId };
}

describe('runtime contract validators', () => {
    test('accepts valid agent events and rejects invalid event types and timestamps', () => {
        const event: AgentEvent = {
            type: 'agent_status',
            harness: 'omp-squad',
            sessionId: 'session-1',
            project: 'lunarpup',
            message: 'skating',
            timestamp: '2026-07-09T12:00:00.000Z',
        };

        expect(expectOk(validateAgentEvent(event))).toEqual(event);
        expectError(validateAgentEvent({ ...event, type: 'agent_started' }), 'type must be one of agent_session_start, agent_status, agent_needs_input, agent_done');
        expectError(validateAgentEvent({ ...event, timestamp: 'not-a-date' }), 'timestamp must be an ISO-compatible date string');
    });

    test('accepts complete cosmetic definitions and rejects malformed visuals', () => {
        const cosmetic: CosmeticDefinition = {
            id: 'comet-board',
            slot: 'board',
            rarity: 'epic',
            visual: {
                colors: ['#00ffcc', '#ffffff80'],
                mesh: { shape: 'box', scale: [1, 0.2, 2], roughness: 0.75, metalness: 0.1 },
                particles: { count: 32, size: 0.08, lifetime: 0.5, emissionRate: 12 },
            },
        };

        expect(expectOk(validateCosmeticDefinition(cosmetic))).toEqual(cosmetic);
        expectError(validateCosmeticDefinition({ ...cosmetic, slot: 'helmet' }), 'slot must be one of board, body, trail, aura');
        expectError(
            validateCosmeticDefinition({ ...cosmetic, visual: { ...cosmetic.visual, colors: ['#00ffcc', 'blue'] } }),
            'visual.colors[1] must be a #RRGGBB or #RRGGBBAA color',
        );
        expectError(
            validateCosmeticDefinition({ ...cosmetic, visual: { ...cosmetic.visual, mesh: { shape: 'sphere', scale: [1, Number.POSITIVE_INFINITY, 1] } } }),
            'visual.mesh.scale values must be finite',
        );
    });

    test('accepts package manifests only when the canonical id and asset hashes are valid', () => {
        const manifest = validManifest();

        expect(expectOk(validatePackageManifest(manifest))).toEqual(manifest);
        expectError(
            validatePackageManifest({ ...manifest, id: '0'.repeat(64) }),
            `id must be sha256 of canonical manifest JSON (${manifest.id})`,
        );
        expectError(
            validatePackageManifest({ ...manifest, assetRefs: [{ ...manifest.assetRefs[0], sha256: 'A'.repeat(64) }] }),
            'assetRefs[0].sha256 must be 64 lowercase hex characters',
        );
    });

    test('accepts extension manifests with optional server and client entries', () => {
        const withoutId: Omit<PackageManifest, 'id'> = {
            kind: 'extension',
            version: '1.0.0',
            author: 'Moon Kennel',
            displayName: 'Agent Harness',
            assetRefs: [],
            serverModule: './server.ts',
            clientModule: './client.ts',
        };
        const manifest = { id: packageManifestId(withoutId), ...withoutId };

        expect(expectOk(validatePackageManifest(manifest))).toEqual(manifest);
    });

    test('validates room client commands and room server broadcasts', () => {
        expect(expectOk(validateRoomClientMessage({ type: 'create_room', roomId: 'moon-bowl', gamemodeId: 'checkpoint-race', playerId: 'pup-1' }))).toEqual({
            type: 'create_room',
            roomId: 'moon-bowl',
            gamemodeId: 'checkpoint-race',
            playerId: 'pup-1',
        });
        expect(expectOk(validateRoomClientMessage({ type: 'list_rooms' }))).toEqual({ type: 'list_rooms' });
        expectError(validateRoomClientMessage({ type: 'create_room', roomId: 'moon-bowl', playerId: 'pup-1' }), 'gamemodeId must be a non-empty string');

        expect(expectOk(validateRoomServerMessage({ type: 'room_state', roomId: 'moon-bowl', gamemodeId: 'checkpoint-race', players: ['pup-1', 'pup-2'] }))).toEqual({
            type: 'room_state',
            roomId: 'moon-bowl',
            gamemodeId: 'checkpoint-race',
            players: ['pup-1', 'pup-2'],
        });
        expect(expectOk(validateRoomServerMessage({ type: 'room_list', rooms: [{ roomId: 'moon-bowl', gamemodeId: 'checkpoint-race', playerCount: 2 }] }))).toEqual({
            type: 'room_list',
            rooms: [{ roomId: 'moon-bowl', gamemodeId: 'checkpoint-race', playerCount: 2 }],
        });
        expectError(validateRoomServerMessage({ type: 'room_list', rooms: [{ roomId: 'moon-bowl', gamemodeId: 'checkpoint-race', playerCount: 'two' }] }), 'rooms[0].playerCount must be a finite number');
        expectError(validateRoomServerMessage({ type: 'room_state', roomId: 'moon-bowl', gamemodeId: 'checkpoint-race', players: ['pup-1', 2] }), 'players[1] must be a string');
    });
});
