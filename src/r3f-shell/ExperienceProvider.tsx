import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useLayoutEffect,
    useMemo,
    useReducer,
    useRef,
    useSyncExternalStore,
    type ReactNode,
} from 'react';
import { pauseController } from '../game/pause.ts';
import { setMenuOrbit } from '../game/runtimeRegistry.ts';
import { hasSeenMainMenu, markMainMenuSeen } from '../ui/menuState.ts';
import { markControlsSeen } from '../ui/controlsLegendState.ts';
import {
    createInitialExperienceState,
    experienceReducer,
    isExperienceCovered,
    type ExperienceState,
} from '../ui/experienceState.ts';

type FocusTarget = HTMLElement | null | undefined;

interface ExperienceContextValue {
    state: ExperienceState;
    covered: boolean;
    simulationPaused: boolean;
    openMainMenu: (trigger?: FocusTarget) => void;
    openPauseMenu: (trigger?: FocusTarget) => void;
    openSettings: (trigger?: FocusTarget) => void;
    openControls: (trigger?: FocusTarget) => void;
    back: () => void;
    play: () => void;
    quitToMainMenu: () => void;
}

const ExperienceContext = createContext<ExperienceContextValue | null>(null);

function focusSelector(target: FocusTarget): string | null {
    if (!target) return null;
    if (target.id) return `#${CSS.escape(target.id)}`;
    const key = target.dataset.focusKey;
    return key ? `[data-focus-key="${CSS.escape(key)}"]` : null;
}

export function ExperienceProvider({ children }: { children: ReactNode }) {
    const [state, dispatch] = useReducer(
        experienceReducer,
        undefined,
        () => createInitialExperienceState(!hasSeenMainMenu()),
    );
    const focusHistory = useRef<string[]>([]);
    const pendingFocus = useRef<string | null>(null);
    const simulationPaused = useSyncExternalStore(
        pauseController.subscribe,
        pauseController.isPaused,
        pauseController.isPaused,
    );

    const rememberFocus = useCallback((trigger?: FocusTarget) => {
        const selector = focusSelector(trigger ?? document.activeElement as HTMLElement | null);
        if (selector) focusHistory.current.push(selector);
    }, []);

    const openMainMenu = useCallback((trigger?: FocusTarget) => {
        rememberFocus(trigger);
        dispatch({ type: 'OPEN_MAIN_MENU' });
    }, [rememberFocus]);

    const openPauseMenu = useCallback((trigger?: FocusTarget) => {
        rememberFocus(trigger);
        dispatch({ type: 'OPEN_PAUSE_MENU' });
    }, [rememberFocus]);

    const openSettings = useCallback((trigger?: FocusTarget) => {
        rememberFocus(trigger);
        dispatch({ type: 'OPEN_SETTINGS' });
    }, [rememberFocus]);

    const openControls = useCallback((trigger?: FocusTarget) => {
        rememberFocus(trigger);
        dispatch({ type: 'OPEN_CONTROLS' });
    }, [rememberFocus]);

    const back = useCallback(() => {
        if (state.surface === 'controls') markControlsSeen();
        pendingFocus.current = focusHistory.current.pop() ?? '#menu-button';
        dispatch({ type: 'BACK' });
    }, [state.surface]);

    const play = useCallback(() => {
        if (state.surface === 'main-menu') markMainMenuSeen();
        focusHistory.current = [];
        pendingFocus.current = '#menu-button';
        dispatch({ type: 'PLAY' });
    }, [state.surface]);

    const quitToMainMenu = useCallback(() => {
        focusHistory.current = [];
        pendingFocus.current = null;
        dispatch({ type: 'QUIT_TO_MAIN_MENU' });
    }, []);

    useLayoutEffect(() => {
        const selector = pendingFocus.current;
        if (!selector) return;
        pendingFocus.current = null;
        const frame = window.requestAnimationFrame(() => {
            document.querySelector<HTMLElement>(selector)?.focus({ preventScroll: true });
        });
        return () => window.cancelAnimationFrame(frame);
    }, [state.surface]);

    useEffect(() => {
        const covered = isExperienceCovered(state);
        pauseController.setPaused(covered);
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        setMenuOrbit(state.surface === 'main-menu', reduced);

        return () => {
            pauseController.setPaused(false);
            setMenuOrbit(false);
        };
    }, [state]);

    const value = useMemo<ExperienceContextValue>(() => ({
        state,
        covered: isExperienceCovered(state),
        simulationPaused,
        openMainMenu,
        openPauseMenu,
        openSettings,
        openControls,
        back,
        play,
        quitToMainMenu,
    }), [
        back,
        openControls,
        openMainMenu,
        openPauseMenu,
        openSettings,
        play,
        quitToMainMenu,
        simulationPaused,
        state,
    ]);

    return <ExperienceContext.Provider value={value}>{children}</ExperienceContext.Provider>;
}

export function useExperience(): ExperienceContextValue {
    const context = useContext(ExperienceContext);
    if (!context) throw new Error('useExperience must be used within ExperienceProvider');
    return context;
}
