import { describe, expect, test } from 'bun:test';
import { createAsyncLifecycleOwner, type LifecycleDisposer } from './asyncLifecycle.ts';

describe('createAsyncLifecycleOwner', () => {
    test('disposes a stale async resolution and retains only the latest generation', async () => {
        const owner = createAsyncLifecycleOwner();
        const first = Promise.withResolvers<LifecycleDisposer>();
        const disposed: string[] = [];

        const firstStart = owner.start(() => first.promise);
        const secondStart = owner.start(async () => () => disposed.push('second'));
        first.resolve(() => disposed.push('first'));

        expect(await firstStart).toBe(false);
        expect(await secondStart).toBe(true);
        expect(disposed).toEqual(['first']);

        owner.dispose();
        expect(disposed).toEqual(['first', 'second']);
    });

    test('aborts pending initialization on dispose', async () => {
        const owner = createAsyncLifecycleOwner();
        let signal: AbortSignal | undefined;
        const pending = Promise.withResolvers<LifecycleDisposer>();
        const start = owner.start((ownedSignal) => {
            signal = ownedSignal;
            return pending.promise;
        });

        owner.dispose();
        expect(signal?.aborted).toBe(true);
        pending.resolve(() => undefined);
        expect(await start).toBe(false);
    });
});
