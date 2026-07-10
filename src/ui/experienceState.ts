export type ExperienceSurface = 'play' | 'main-menu' | 'pause-menu' | 'settings' | 'controls';

export type ExperienceDestination = 'play' | 'settings' | 'controls';

export type ExperiencePresentation = 'gameplay' | 'menu';

export interface ExperienceFrame {
    surface: ExperienceSurface;
    destination: ExperienceDestination;
    origin: ExperienceSurface;
    returnTarget: ExperienceSurface | null;
    presentation: ExperiencePresentation;
}

export interface ExperienceState extends ExperienceFrame {
    history: ExperienceFrame[];
}

export type ExperienceAction =
    | { type: 'OPEN_MAIN_MENU' }
    | { type: 'OPEN_PAUSE_MENU' }
    | { type: 'OPEN_SETTINGS' }
    | { type: 'OPEN_CONTROLS' }
    | { type: 'BACK' }
    | { type: 'PLAY' }
    | { type: 'QUIT_TO_MAIN_MENU' };

const PLAY_FRAME: ExperienceFrame = {
    surface: 'play',
    destination: 'play',
    origin: 'play',
    returnTarget: null,
    presentation: 'gameplay',
};

function frame(
    surface: ExperienceSurface,
    origin: ExperienceSurface,
    returnTarget: ExperienceSurface | null,
): ExperienceFrame {
    return {
        surface,
        destination: surface === 'settings' || surface === 'controls' ? surface : 'play',
        origin,
        returnTarget,
        presentation: surface === 'play' ? 'gameplay' : 'menu',
    };
}

function currentFrame(state: ExperienceState): ExperienceFrame {
    const { history: _history, ...current } = state;
    return current;
}

function enter(state: ExperienceState, surface: ExperienceSurface): ExperienceState {
    if (state.surface === surface) return state;
    return {
        ...frame(surface, state.surface, state.surface),
        history: [...state.history, currentFrame(state)],
    };
}

export function createInitialExperienceState(showMainMenu: boolean): ExperienceState {
    if (!showMainMenu) return { ...PLAY_FRAME, history: [] };
    return {
        ...frame('main-menu', 'play', 'play'),
        history: [PLAY_FRAME],
    };
}

export function experienceReducer(state: ExperienceState, action: ExperienceAction): ExperienceState {
    switch (action.type) {
        case 'OPEN_MAIN_MENU':
            return state.surface === 'play' ? enter(state, 'main-menu') : state;
        case 'OPEN_PAUSE_MENU':
            return state.surface === 'play' ? enter(state, 'pause-menu') : state;
        case 'OPEN_SETTINGS':
            return state.surface === 'play' || state.surface === 'main-menu' || state.surface === 'pause-menu'
                ? enter(state, 'settings')
                : state;
        case 'OPEN_CONTROLS':
            return state.surface === 'settings' ? enter(state, 'controls') : state;
        case 'BACK': {
            const previous = state.history.at(-1);
            if (!previous) return { ...PLAY_FRAME, history: [] };
            return { ...previous, history: state.history.slice(0, -1) };
        }
        case 'PLAY':
            return { ...PLAY_FRAME, history: [] };
        case 'QUIT_TO_MAIN_MENU':
            return {
                ...frame('main-menu', state.surface, 'play'),
                history: [PLAY_FRAME],
            };
    }
}

export function isExperienceCovered(state: ExperienceState): boolean {
    return state.surface !== 'play';
}
