/**
 * Local-simulation pause gate.
 *
 * Pausing freezes local physics/tricks/gamemode stepping (see `runFrame` in
 * `frame.ts`) but never the network: remote players keep moving and outgoing
 * state keeps flowing. Menus (main menu, pause menu) are the drivers — they are
 * mutually exclusive, so a single boolean is the source of truth.
 */

export type PauseListener = (paused: boolean) => void;

export interface PauseController {
    isPaused(): boolean;
    setPaused(value: boolean): void;
    toggle(): void;
    subscribe(listener: PauseListener): () => void;
}

export function createPauseController(): PauseController {
    let paused = false;
    const listeners = new Set<PauseListener>();

    const controller: PauseController = {
        isPaused: () => paused,
        setPaused(value) {
            if (value === paused) return;
            paused = value;
            for (const listener of listeners) listener(paused);
        },
        toggle() {
            controller.setPaused(!paused);
        },
        subscribe(listener) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
    };

    return controller;
}

export const pauseController = createPauseController();
