export type ReplayRunEventType =
    | 'run_start'
    | 'first_meaningful_input'
    | 'first_skill_beat'
    | 'finish'
    | 'result_shown'
    | 'retry_selected'
    | 'abandonment';

export interface ReplayRunEvent {
    type: ReplayRunEventType;
    attempt: number;
    atMs: number;
}

export type ReplayRunPhase = 'idle' | 'running' | 'finished' | 'results';

export interface ReplayRunState {
    phase: ReplayRunPhase;
    attempt: number;
    events: ReplayRunEvent[];
    recordedInput: boolean;
    recordedSkillBeat: boolean;
}

export type ReplayRunAction =
    | { type: 'START' }
    | { type: 'MEANINGFUL_INPUT'; atMs: number }
    | { type: 'SKILL_BEAT'; atMs: number }
    | { type: 'FINISH'; atMs: number }
    | { type: 'SHOW_RESULT'; atMs: number }
    | { type: 'RETRY'; atMs: number }
    | { type: 'ABANDON'; atMs: number };

export function createReplayRunState(): ReplayRunState {
    return {
        phase: 'idle',
        attempt: 0,
        events: [],
        recordedInput: false,
        recordedSkillBeat: false,
    };
}

function append(state: ReplayRunState, type: ReplayRunEventType, atMs: number): ReplayRunEvent[] {
    return [...state.events, { type, attempt: state.attempt, atMs: Math.max(0, Math.round(atMs)) }];
}

export function reduceReplayRun(state: ReplayRunState, action: ReplayRunAction): ReplayRunState {
    switch (action.type) {
        case 'START': {
            if (state.phase === 'running') return state;
            const attempt = state.attempt + 1;
            return {
                phase: 'running',
                attempt,
                events: [...state.events, { type: 'run_start', attempt, atMs: 0 }],
                recordedInput: false,
                recordedSkillBeat: false,
            };
        }
        case 'MEANINGFUL_INPUT':
            if (state.phase !== 'running' || state.recordedInput) return state;
            return { ...state, recordedInput: true, events: append(state, 'first_meaningful_input', action.atMs) };
        case 'SKILL_BEAT':
            if (state.phase !== 'running' || state.recordedSkillBeat) return state;
            return { ...state, recordedSkillBeat: true, events: append(state, 'first_skill_beat', action.atMs) };
        case 'FINISH':
            if (state.phase !== 'running') return state;
            return { ...state, phase: 'finished', events: append(state, 'finish', action.atMs) };
        case 'ABANDON':
            if (state.phase !== 'running') return state;
            return { ...state, phase: 'finished', events: append(state, 'abandonment', action.atMs) };
        case 'SHOW_RESULT':
            if (state.phase !== 'finished') return state;
            return { ...state, phase: 'results', events: append(state, 'result_shown', action.atMs) };
        case 'RETRY': {
            if (state.phase !== 'results') return state;
            const events = append(state, 'retry_selected', action.atMs);
            const attempt = state.attempt + 1;
            return {
                phase: 'running',
                attempt,
                events: [...events, { type: 'run_start', attempt, atMs: 0 }],
                recordedInput: false,
                recordedSkillBeat: false,
            };
        }
    }
}
