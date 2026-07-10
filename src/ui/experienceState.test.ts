import { describe, expect, test } from 'bun:test';
import {
    createInitialExperienceState,
    experienceReducer,
    isExperienceCovered,
    type ExperienceState,
    type ExperienceSurface,
} from './experienceState.ts';

function fromOrigin(origin: 'play' | 'main-menu' | 'pause-menu'): ExperienceState {
    let state = createInitialExperienceState(false);
    if (origin === 'main-menu') state = experienceReducer(state, { type: 'OPEN_MAIN_MENU' });
    if (origin === 'pause-menu') state = experienceReducer(state, { type: 'OPEN_PAUSE_MENU' });
    return state;
}

describe('experience navigation', () => {
    test.each(['play', 'main-menu', 'pause-menu'] as const)(
        'Settings returns to its %s origin',
        (origin) => {
            const starting = fromOrigin(origin);
            const settings = experienceReducer(starting, { type: 'OPEN_SETTINGS' });

            expect(settings.surface).toBe('settings');
            expect(settings.destination).toBe('settings');
            expect(settings.origin).toBe(origin);
            expect(settings.returnTarget).toBe(origin);
            expect(experienceReducer(settings, { type: 'BACK' })).toEqual(starting);
        },
    );

    test.each(['play', 'main-menu', 'pause-menu'] as const)(
        'Controls is a Settings child and pops one layer for a %s origin',
        (origin) => {
            const starting = fromOrigin(origin);
            const settings = experienceReducer(starting, { type: 'OPEN_SETTINGS' });
            const controls = experienceReducer(settings, { type: 'OPEN_CONTROLS' });

            expect(controls.surface).toBe('controls');
            expect(controls.origin).toBe('settings');
            expect(controls.returnTarget).toBe('settings');
            expect(experienceReducer(controls, { type: 'BACK' })).toEqual(settings);
            expect(experienceReducer(experienceReducer(controls, { type: 'BACK' }), { type: 'BACK' })).toEqual(starting);
        },
    );

    test('menu and pause both dismiss to play', () => {
        for (const surface of ['main-menu', 'pause-menu'] as ExperienceSurface[]) {
            const action = surface === 'main-menu' ? 'OPEN_MAIN_MENU' : 'OPEN_PAUSE_MENU';
            const open = experienceReducer(createInitialExperienceState(false), { type: action });
            const closed = experienceReducer(open, { type: 'BACK' });
            expect(closed.surface).toBe('play');
            expect(closed.presentation).toBe('gameplay');
        }
    });

    test('unfinished destinations cannot be entered through the state machine', () => {
        const play = createInitialExperienceState(false);
        expect(experienceReducer(play, { type: 'OPEN_CONTROLS' })).toBe(play);
        expect(Object.values(play).join(' ')).not.toMatch(/shop|room|wallet|customize/i);
    });

    test('covered and presentation state stay explicit', () => {
        const play = createInitialExperienceState(false);
        const menu = experienceReducer(play, { type: 'OPEN_MAIN_MENU' });
        expect(isExperienceCovered(play)).toBe(false);
        expect(isExperienceCovered(menu)).toBe(true);
        expect(menu.presentation).toBe('menu');
    });

    test('Play and Quit reset stale history', () => {
        const menu = experienceReducer(createInitialExperienceState(false), { type: 'OPEN_MAIN_MENU' });
        const settings = experienceReducer(menu, { type: 'OPEN_SETTINGS' });
        expect(experienceReducer(settings, { type: 'PLAY' })).toEqual(createInitialExperienceState(false));

        const pause = experienceReducer(createInitialExperienceState(false), { type: 'OPEN_PAUSE_MENU' });
        const quit = experienceReducer(pause, { type: 'QUIT_TO_MAIN_MENU' });
        expect(quit.surface).toBe('main-menu');
        expect(experienceReducer(quit, { type: 'BACK' }).surface).toBe('play');
    });
});
