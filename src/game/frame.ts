/**
 * Per-frame update gate.
 *
 * Splits a frame into the local simulation (physics, tricks, gamemode, cosmetic
 * animation) which freezes while paused, and the presentation/network step
 * (camera, remote players, minimap, outgoing snapshots, render) which always
 * runs. Keeping this a pure function makes the freeze contract testable without
 * a WebGL context.
 */

export interface FrameHandlers {
    /** Local simulation. Skipped entirely while paused. */
    stepLocal: (dt: number) => void;
    /** Camera, network, and render. Runs every frame, paused or not. */
    present: (dt: number) => void;
}

export function runFrame(dt: number, paused: boolean, handlers: FrameHandlers): void {
    if (!paused) handlers.stepLocal(dt);
    handlers.present(dt);
}
