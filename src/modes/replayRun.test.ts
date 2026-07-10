import { describe, expect, test } from 'bun:test';
import { createReplayRunState, reduceReplayRun, type ReplayRunAction } from './replayRun.ts';

function apply(actions: ReplayRunAction[]) {
    return actions.reduce(reduceReplayRun, createReplayRunState());
}

describe('replay-worthy run lifecycle', () => {
    test('records the meaningful finish and retry sequence deterministically', () => {
        const state = apply([
            { type: 'START' },
            { type: 'MEANINGFUL_INPUT', atMs: 126.4 },
            { type: 'MEANINGFUL_INPUT', atMs: 200 },
            { type: 'SKILL_BEAT', atMs: 4_480.6 },
            { type: 'SKILL_BEAT', atMs: 5_000 },
            { type: 'FINISH', atMs: 51_204.2 },
            { type: 'FINISH', atMs: 51_205 },
            { type: 'SHOW_RESULT', atMs: 51_204.2 },
            { type: 'SHOW_RESULT', atMs: 51_300 },
            { type: 'RETRY', atMs: 51_900.8 },
            { type: 'RETRY', atMs: 52_000 },
        ]);

        expect(state.phase).toBe('running');
        expect(state.attempt).toBe(2);
        expect(state.events).toEqual([
            { type: 'run_start', attempt: 1, atMs: 0 },
            { type: 'first_meaningful_input', attempt: 1, atMs: 126 },
            { type: 'first_skill_beat', attempt: 1, atMs: 4_481 },
            { type: 'finish', attempt: 1, atMs: 51_204 },
            { type: 'result_shown', attempt: 1, atMs: 51_204 },
            { type: 'retry_selected', attempt: 1, atMs: 51_901 },
            { type: 'run_start', attempt: 2, atMs: 0 },
        ]);
    });

    test('records abandonment once and cannot retry before results are shown', () => {
        const state = apply([
            { type: 'START' },
            { type: 'ABANDON', atMs: 8_000 },
            { type: 'ABANDON', atMs: 8_100 },
            { type: 'RETRY', atMs: 8_200 },
            { type: 'SHOW_RESULT', atMs: 8_000 },
        ]);

        expect(state.phase).toBe('results');
        expect(state.events.map(event => event.type)).toEqual([
            'run_start',
            'abandonment',
            'result_shown',
        ]);
    });
});
