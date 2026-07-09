import { describe, expect, test } from 'bun:test';
import { runFrame, type FrameHandlers } from './frame.ts';

function spyHandlers() {
    const localArgs: number[] = [];
    const presentArgs: number[] = [];
    const handlers: FrameHandlers = {
        stepLocal: (dt) => localArgs.push(dt),
        present: (dt) => presentArgs.push(dt),
    };
    return { handlers, localArgs, presentArgs };
}

describe('runFrame freeze contract', () => {
    test('unpaused runs both stepLocal and present once with the same dt', () => {
        const { handlers, localArgs, presentArgs } = spyHandlers();

        runFrame(0.016, false, handlers);

        expect(localArgs).toEqual([0.016]);
        expect(presentArgs).toEqual([0.016]);
    });

    test('paused skips stepLocal entirely but still presents once with dt', () => {
        const { handlers, localArgs, presentArgs } = spyHandlers();

        runFrame(0.016, true, handlers);

        expect(localArgs).toEqual([]);
        expect(presentArgs).toEqual([0.016]);
    });

    test('forwards dt unchanged across a mix of paused and unpaused frames', () => {
        const { handlers, localArgs, presentArgs } = spyHandlers();

        runFrame(0.01, false, handlers);
        runFrame(0.5, true, handlers);
        runFrame(0.25, false, handlers);

        // present runs every frame; stepLocal only on the unpaused ones.
        expect(presentArgs).toEqual([0.01, 0.5, 0.25]);
        expect(localArgs).toEqual([0.01, 0.25]);
    });
});
