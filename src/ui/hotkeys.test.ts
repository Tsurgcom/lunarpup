import { describe, expect, test } from 'bun:test';
import { hotkeyForKey, isTypingTarget } from './hotkeys.ts';
import type { ViewId } from './viewController.ts';

describe('hotkeyForKey', () => {
    const mapped: Array<[string, string, ViewId]> = [
        ['c', 'C', 'shop'],
        ['r', 'R', 'rooms'],
        ['t', 'T', 'settings'],
    ];

    for (const [lower, upper, view] of mapped) {
        test(`'${lower}' and '${upper}' both map to ${view}`, () => {
            expect(hotkeyForKey(lower)).toBe(view);
            expect(hotkeyForKey(upper)).toBe(view);
        });
    }

    test("'?' maps to controls", () => {
        expect(hotkeyForKey('?')).toBe('controls');
    });

    for (const key of ['x', 'Enter', 'Escape', ' ', '']) {
        test(`unmapped key ${JSON.stringify(key)} -> null`, () => {
            expect(hotkeyForKey(key)).toBeNull();
        });
    }
});

describe('isTypingTarget', () => {
    test('INPUT is a typing target (uppercase tagName)', () => {
        expect(isTypingTarget({ tagName: 'INPUT' } as unknown as EventTarget)).toBe(true);
    });

    test('textarea is a typing target (lowercase tagName)', () => {
        expect(isTypingTarget({ tagName: 'textarea' } as unknown as EventTarget)).toBe(true);
    });

    test('SELECT is a typing target', () => {
        expect(isTypingTarget({ tagName: 'select' } as unknown as EventTarget)).toBe(true);
    });

    test('a plain DIV is not a typing target', () => {
        expect(isTypingTarget({ tagName: 'DIV' } as unknown as EventTarget)).toBe(false);
    });

    test('a contentEditable DIV is a typing target', () => {
        expect(
            isTypingTarget({ tagName: 'DIV', isContentEditable: true } as unknown as EventTarget),
        ).toBe(true);
    });

    test('null is not a typing target', () => {
        expect(isTypingTarget(null)).toBe(false);
    });

    test('a target without a string tagName is not a typing target', () => {
        expect(isTypingTarget({} as unknown as EventTarget)).toBe(false);
    });
});
