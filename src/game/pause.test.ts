import { describe, expect, test } from 'bun:test';
import { createPauseController } from './pause.ts';

describe('createPauseController', () => {
    test('starts unpaused and setPaused(true) flips isPaused', () => {
        const controller = createPauseController();

        expect(controller.isPaused()).toBe(false);

        controller.setPaused(true);

        expect(controller.isPaused()).toBe(true);
    });

    test('notifies subscribers only on an actual change', () => {
        const controller = createPauseController();
        const seen: boolean[] = [];
        controller.subscribe((paused) => seen.push(paused));

        controller.setPaused(true); // change -> notify
        controller.setPaused(true); // no change -> silent

        expect(seen).toEqual([true]);
    });

    test('toggle flips the value and notifies', () => {
        const controller = createPauseController();
        const seen: boolean[] = [];
        controller.subscribe((paused) => seen.push(paused));

        controller.toggle(); // false -> true
        controller.toggle(); // true -> false

        expect(controller.isPaused()).toBe(false);
        expect(seen).toEqual([true, false]);
    });

    test('unsubscribing stops further notifications', () => {
        const controller = createPauseController();
        const seen: boolean[] = [];
        const unsubscribe = controller.subscribe((paused) => seen.push(paused));

        controller.setPaused(true);
        unsubscribe();
        controller.setPaused(false);

        expect(seen).toEqual([true]);
    });
});
