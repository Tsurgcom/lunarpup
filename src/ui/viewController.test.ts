import { describe, expect, test } from 'bun:test';
import { createViewController, type ViewBinding, type ViewId } from './viewController.ts';

// A binding that records its show/hide calls into a shared, ordered log so tests
// can assert the exclusivity sequence (hide-then-show) across views.
function spyBinding(id: ViewId, log: string[]): ViewBinding {
    return {
        show: () => log.push(`${id}:show`),
        hide: () => log.push(`${id}:hide`),
    };
}

describe('createViewController', () => {
    test('fresh controller has no open view', () => {
        const vc = createViewController();
        expect(vc.current()).toBeNull();
        expect(vc.isOpen()).toBe(false);
        expect(vc.isOpen('shop')).toBe(false);
    });

    test('opening a registered view shows it once and sets current', () => {
        const log: string[] = [];
        const vc = createViewController();
        vc.register('shop', spyBinding('shop', log));

        vc.open('shop');

        expect(log).toEqual(['shop:show']);
        expect(vc.current()).toBe('shop');
        expect(vc.isOpen()).toBe(true);
        expect(vc.isOpen('shop')).toBe(true);
        expect(vc.isOpen('rooms')).toBe(false);
    });

    test('exclusivity: opening B while A is open hides A before showing B', () => {
        const log: string[] = [];
        const vc = createViewController();
        vc.register('shop', spyBinding('shop', log));
        vc.register('rooms', spyBinding('rooms', log));

        vc.open('shop');
        vc.open('rooms');

        // hide of the outgoing view must precede show of the incoming one.
        expect(log).toEqual(['shop:show', 'shop:hide', 'rooms:show']);
        expect(vc.current()).toBe('rooms');
        expect(vc.isOpen('rooms')).toBe(true);
        expect(vc.isOpen('shop')).toBe(false);
    });

    test('opening an unregistered id is a no-op', () => {
        const log: string[] = [];
        const vc = createViewController();
        vc.register('shop', spyBinding('shop', log));
        vc.open('shop');
        log.length = 0;

        vc.open('settings'); // never registered

        expect(log).toEqual([]);
        expect(vc.current()).toBe('shop');
    });

    test('opening the already-open id does not re-show or hide', () => {
        const log: string[] = [];
        const vc = createViewController();
        vc.register('shop', spyBinding('shop', log));

        vc.open('shop');
        vc.open('shop');

        expect(log).toEqual(['shop:show']);
        expect(vc.current()).toBe('shop');
    });

    test('close hides the current view and resets to null', () => {
        const log: string[] = [];
        const vc = createViewController();
        vc.register('shop', spyBinding('shop', log));

        vc.open('shop');
        vc.close();

        expect(log).toEqual(['shop:show', 'shop:hide']);
        expect(vc.current()).toBeNull();
        expect(vc.isOpen()).toBe(false);
    });

    test('close with nothing open is a no-op', () => {
        const log: string[] = [];
        const vc = createViewController();
        vc.register('shop', spyBinding('shop', log));

        vc.close();

        expect(log).toEqual([]);
        expect(vc.current()).toBeNull();
    });

    test('toggle opens when closed and closes when it is the active view', () => {
        const log: string[] = [];
        const vc = createViewController();
        vc.register('shop', spyBinding('shop', log));

        vc.toggle('shop');
        expect(vc.current()).toBe('shop');

        vc.toggle('shop');
        expect(vc.current()).toBeNull();

        expect(log).toEqual(['shop:show', 'shop:hide']);
    });

    test('toggle of a different view switches exclusively', () => {
        const log: string[] = [];
        const vc = createViewController();
        vc.register('shop', spyBinding('shop', log));
        vc.register('rooms', spyBinding('rooms', log));

        vc.toggle('shop');
        vc.toggle('rooms'); // shop is active, so this opens rooms (not a close)

        expect(log).toEqual(['shop:show', 'shop:hide', 'rooms:show']);
        expect(vc.current()).toBe('rooms');
    });

    test('re-register replaces the binding used on next open', () => {
        const log: string[] = [];
        const vc = createViewController();
        vc.register('shop', spyBinding('shop', log));
        vc.register('shop', {
            show: () => log.push('shop2:show'),
            hide: () => log.push('shop2:hide'),
        });

        vc.open('shop');

        expect(log).toEqual(['shop2:show']);
        expect(vc.current()).toBe('shop');
    });
});
