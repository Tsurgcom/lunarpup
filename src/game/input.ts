import type { GameRuntime } from './types.ts';

export function handleKeys(runtime: GameRuntime, event: KeyboardEvent, isPressed: boolean) {
    const { keys, jumpInput } = runtime;

    if (['ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyF', 'Space', 'ShiftLeft', 'ShiftRight'].includes(event.code)) {
        event.preventDefault();
    }

    switch (event.code) {
        case 'ArrowUp':
        case 'KeyW': keys.w = isPressed; break;
        case 'ArrowLeft':
        case 'KeyA': keys.a = isPressed; break;
        case 'ArrowDown':
        case 'KeyS': keys.s = isPressed; break;
        case 'ArrowRight':
        case 'KeyD': keys.d = isPressed; break;
        case 'KeyQ': keys.q = isPressed; break;
        case 'KeyE': keys.e = isPressed; break;
        case 'KeyF': keys.f = isPressed; break;
        case 'Space':
            keys.space = isPressed;
            if (isPressed) jumpInput.queuedAt = performance.now();
            break;
        case 'ShiftLeft':
        case 'ShiftRight': keys.shift = isPressed; break;
    }
}
