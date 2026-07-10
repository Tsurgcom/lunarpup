import { describe, expect, test } from 'bun:test';
import type { ServerWebSocket } from 'bun';
import { SqliteCurrencyInventoryService, SqliteEventLedgerStorage } from '../contracts/services.ts';
import { registerGamemodeModule, RUN_SAMPLE_TRUST } from './gamemodes.ts';
import { createInitialConnection, type PlayerConnection } from './multiplayer.ts';
import { ModularRouter } from './router.ts';

describe('gamemode telemetry boundary', () => {
    test('a forged finish sample records untrusted telemetry without mutating economy', async () => {
        const path = `/tmp/lunarpup-gamemode-${crypto.randomUUID()}.sqlite`;
        const ledger = new SqliteEventLedgerStorage({ path });
        const economy = new SqliteCurrencyInventoryService({ path, ledger });
        economy.grant('forged-player', 100, 'test baseline');

        const sent: unknown[] = [];
        const ws = {
            data: undefined as unknown as PlayerConnection,
            send(raw: string) { sent.push(JSON.parse(raw)); },
        } as ServerWebSocket<PlayerConnection>;
        ws.data = createInitialConnection(ws);

        const router = new ModularRouter<PlayerConnection>();
        registerGamemodeModule(router, { ledger });
        router.dispatchWebSocket(ws, {
            channel: 'gamemode',
            type: 'run_sample',
            gamemodeId: 'checkpoint-race',
            playerId: 'forged-player',
            reason: 'finish',
            samples: [{ t: 1, x: 0, y: 0, z: 0, speed: 999 }],
        });
        await Bun.sleep(0);

        expect(economy.getBalance('forged-player')).toBe(100);
        expect(economy.listOwnedItems('forged-player')).toEqual([]);
        const event = (await ledger.query({ type: 'gamemode_run_sample' }))[0];
        expect(event?.payload).toMatchObject({
            trust: RUN_SAMPLE_TRUST,
            rewardEligible: false,
            rankedEligible: false,
        });
        expect(sent[0]).toMatchObject({ trust: RUN_SAMPLE_TRUST, rewardEligible: false, rankedEligible: false });

        economy.db.close();
        ledger.db.close();
    });
});
