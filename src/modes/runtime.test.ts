import { describe, expect, test } from 'bun:test';
import type { PlayerSnapshot } from '../net/protocol.ts';
import { gamemodePackages, parkourGamemodePackage, raceGamemodePackage } from '../../content/gamemodes/index.ts';
import { createGamemode, createRuntimeState, maybeResetFallenPlayer, processCheckpoint, validateGamemodePackage } from './runtime.ts';

function playerAt(id: string, x: number, y: number, z: number): PlayerSnapshot {
    return {
        id,
        name: id,
        color: 0xffb703,
        x,
        y,
        z,
        qx: 0,
        qy: 0,
        qz: 0,
        qw: 1,
        heading: 0,
        speed: 0,
        isGrounded: true,
        boardTiltX: 0,
        boardTiltZ: 0,
    };
}

describe('gamemode package validation', () => {
    test('sample packages satisfy manifest contract and params', () => {
        for (const pkg of gamemodePackages) {
            expect(validateGamemodePackage(pkg).manifest.kind).toBe('gamemode');
        }
    });

    test('rejects tampered manifest ids', () => {
        expect(() => validateGamemodePackage({
            ...raceGamemodePackage,
            manifest: { ...raceGamemodePackage.manifest, displayName: 'Wrong' },
        })).toThrow('id must be sha256');
    });
});

describe('checkpoint ordering', () => {
    test('only advances the next ordered checkpoint', () => {
        const first = raceGamemodePackage.params.checkpoints[0]!;
        const second = raceGamemodePackage.params.checkpoints[1]!;
        const player = playerAt('p1', second.position.x, second.position.y, second.position.z);
        const state = createRuntimeState(raceGamemodePackage.params, player);

        expect(processCheckpoint(state, player)).toBe(false);
        expect(state.progress.get('p1')?.nextCheckpointIndex).toBe(0);

        player.x = first.position.x;
        player.y = first.position.y;
        player.z = first.position.z;
        expect(processCheckpoint(state, player)).toBe(true);
        expect(state.progress.get('p1')?.nextCheckpointIndex).toBe(1);
    });
});

describe('scoring and win conditions', () => {
    test('race finishes after configured laps and records best lap', () => {
        const player = playerAt('p1', 0, 0, 0);
        const state = createRuntimeState(raceGamemodePackage.params, player);
        const mode = createGamemode(raceGamemodePackage);
        void mode.init({ roomId: 'test', now: () => 0, broadcast: () => undefined });
        void mode.start(state);

        for (let lap = 0; lap < raceGamemodePackage.params.laps!; lap += 1) {
            for (const checkpoint of raceGamemodePackage.params.checkpoints) {
                state.elapsedMs += 1_000;
                player.x = checkpoint.position.x;
                player.y = checkpoint.position.y;
                player.z = checkpoint.position.z;
                void mode.tick(1, state);
            }
        }

        expect(mode.isWinConditionMet(state)).toBe(true);
        const progress = state.progress.get('p1');
        expect(progress?.finishedAtMs).toBe(8_000);
        expect(progress?.bestLapMs).toBe(4_000);
        expect(mode.score('p1', state)).toBeGreaterThan(100_000);
    });

    test('parkour fall resets to last checkpoint and penalizes score', () => {
        const first = parkourGamemodePackage.params.checkpoints[0]!;
        const player = playerAt('p1', first.position.x, first.position.y, first.position.z);
        const state = createRuntimeState(parkourGamemodePackage.params, player);
        state.elapsedMs = 1_000;
        expect(processCheckpoint(state, player)).toBe(true);
        player.y = -100;

        expect(maybeResetFallenPlayer(state, player)).toBe(true);
        expect(player.x).toBe(first.position.x);
        expect(player.y).toBe(first.position.y);
        expect(player.z).toBe(first.position.z);
        expect(state.progress.get('p1')?.falls).toBe(1);
        expect(state.scores.get('p1')).toBe(490);
    });
});
