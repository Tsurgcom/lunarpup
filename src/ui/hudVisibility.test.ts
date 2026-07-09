import { beforeEach, describe, expect, test } from 'bun:test';
import {
    setMenuOpen,
    isGameplayHidden,
    resetMenuVisibility,
    GAMEPLAY_HIDDEN_CLASS,
    type ClassListTarget,
} from './hudVisibility.ts';

interface FakeBody extends ClassListTarget {
    calls: Array<{ token: string; force?: boolean }>;
}

function fakeBody(): FakeBody {
    const calls: FakeBody['calls'] = [];
    return {
        calls,
        classList: {
            toggle(token: string, force?: boolean): boolean {
                calls.push({ token, force });
                return force ?? false;
            },
        },
    };
}

const lastForce = (body: FakeBody): boolean | undefined => body.calls.at(-1)?.force;

// Module-level Set is shared across tests; wipe it before each.
beforeEach(() => {
    resetMenuVisibility();
});

describe('setMenuOpen gating', () => {
    test('opening one menu hides gameplay and toggles the class on with force=true', () => {
        const body = fakeBody();
        expect(setMenuOpen('main', true, body)).toBe(true);
        expect(isGameplayHidden()).toBe(true);
        expect(body.calls).toEqual([{ token: GAMEPLAY_HIDDEN_CLASS, force: true }]);
    });

    test('opening a second menu keeps gameplay hidden', () => {
        const body = fakeBody();
        setMenuOpen('main', true, body);
        expect(setMenuOpen('pause', true, body)).toBe(true);
        expect(isGameplayHidden()).toBe(true);
        expect(lastForce(body)).toBe(true);
    });

    test('closing one of two open menus stays hidden', () => {
        const body = fakeBody();
        setMenuOpen('main', true, body);
        setMenuOpen('pause', true, body);
        expect(setMenuOpen('main', false, body)).toBe(true);
        expect(isGameplayHidden()).toBe(true);
        expect(lastForce(body)).toBe(true);
    });

    test('closing the last menu unhides with force=false', () => {
        const body = fakeBody();
        setMenuOpen('main', true, body);
        setMenuOpen('pause', true, body);
        setMenuOpen('main', false, body);
        expect(setMenuOpen('pause', false, body)).toBe(false);
        expect(isGameplayHidden()).toBe(false);
        expect(lastForce(body)).toBe(false);
    });

    test('duplicate open of the same id is idempotent (one close unhides)', () => {
        const body = fakeBody();
        setMenuOpen('main', true, body);
        setMenuOpen('main', true, body);
        expect(isGameplayHidden()).toBe(true);
        expect(setMenuOpen('main', false, body)).toBe(false);
        expect(isGameplayHidden()).toBe(false);
    });

    test('closing an unknown menu on an empty set is a no-op (stays visible)', () => {
        const body = fakeBody();
        expect(setMenuOpen('ghost', false, body)).toBe(false);
        expect(isGameplayHidden()).toBe(false);
        expect(lastForce(body)).toBe(false);
    });
});

describe('resetMenuVisibility', () => {
    test('clears tracked menus and unhides', () => {
        const body = fakeBody();
        setMenuOpen('main', true, body);
        setMenuOpen('pause', true, body);
        expect(isGameplayHidden()).toBe(true);

        resetMenuVisibility(body);

        expect(isGameplayHidden()).toBe(false);
        expect(lastForce(body)).toBe(false);
    });
});
