import { jumpInput, keys } from '../state.ts';

export function handleKeys(event: KeyboardEvent, isPressed: boolean) {
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

export function bindInput() {
    const onKeyDown = (event: KeyboardEvent) => handleKeys(event, true);
    const onKeyUp = (event: KeyboardEvent) => handleKeys(event, false);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    return () => {
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
        for (const key of Object.keys(keys) as Array<keyof typeof keys>) keys[key] = false;
        jumpInput.queuedAt = 0;
    };
}
