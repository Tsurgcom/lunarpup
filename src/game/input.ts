import { keys } from '../state.ts';

export function handleKeys(event: KeyboardEvent, isPressed: boolean) {
    if (['ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'ShiftRight'].includes(event.code)) {
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
        case 'Space': keys.space = isPressed; break;
        case 'ShiftLeft':
        case 'ShiftRight': keys.shift = isPressed; break;
    }
}

export function bindInput() {
    window.addEventListener('keydown', (e) => handleKeys(e, true));
    window.addEventListener('keyup', (e) => handleKeys(e, false));
}
