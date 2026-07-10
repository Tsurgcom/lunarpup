export type LifecycleDisposer = () => void;

export interface AsyncLifecycleOwner {
    start(factory: (signal: AbortSignal) => Promise<LifecycleDisposer>): Promise<boolean>;
    dispose(): void;
}

export function createAsyncLifecycleOwner(): AsyncLifecycleOwner {
    let generation = 0;
    let controller: AbortController | null = null;
    let currentDisposer: LifecycleDisposer | null = null;

    return {
        async start(factory) {
            generation += 1;
            const ownedGeneration = generation;
            controller?.abort();
            currentDisposer?.();
            currentDisposer = null;

            const ownedController = new AbortController();
            controller = ownedController;
            const disposer = await factory(ownedController.signal);
            if (ownedController.signal.aborted || ownedGeneration !== generation) {
                disposer();
                return false;
            }
            currentDisposer = disposer;
            return true;
        },
        dispose() {
            generation += 1;
            controller?.abort();
            controller = null;
            currentDisposer?.();
            currentDisposer = null;
        },
    };
}
