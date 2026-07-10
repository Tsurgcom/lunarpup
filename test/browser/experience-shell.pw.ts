import { expect, test, type Locator, type Page } from '@playwright/test';

declare global {
    interface Window {
        __lpWindowListeners?: Record<string, number>;
        __lpWebSockets?: { created: number; active: number; closed: number };
        __lpTimers?: { timeouts: number; intervals: number };
    }
}

async function bootFresh(page: Page) {
    await page.addInitScript(() => {
        const balances: Record<string, number> = {};
        const add = EventTarget.prototype.addEventListener;
        const remove = EventTarget.prototype.removeEventListener;
        EventTarget.prototype.addEventListener = function (type, listener, options) {
            if (this === window && ['keydown', 'keyup', 'blur', 'pointerdown'].includes(type)) {
                balances[type] = (balances[type] ?? 0) + 1;
            }
            return add.call(this, type, listener as EventListenerOrEventListenerObject, options);
        };
        EventTarget.prototype.removeEventListener = function (type, listener, options) {
            if (this === window && ['keydown', 'keyup', 'blur', 'pointerdown'].includes(type)) {
                balances[type] = (balances[type] ?? 0) - 1;
            }
            return remove.call(this, type, listener as EventListenerOrEventListenerObject, options);
        };
        window.__lpWindowListeners = balances;

        const socketState = { created: 0, active: 0, closed: 0 };
        const NativeWebSocket = window.WebSocket;
        class TrackedWebSocket extends NativeWebSocket {
            constructor(url: string | URL, protocols?: string | string[]) {
                super(url, protocols);
                // Bun's dev server opens its own reload socket; the ownership
                // contract counts application sockets only.
                if (String(url).includes('/_bun/')) return;
                socketState.created += 1;
                socketState.active += 1;
                let counted = false;
                this.addEventListener('close', () => {
                    if (counted) return;
                    counted = true;
                    socketState.active -= 1;
                    socketState.closed += 1;
                });
            }
        }
        window.WebSocket = TrackedWebSocket;
        window.__lpWebSockets = socketState;

        const timerState = { timeouts: 0, intervals: 0 };
        const timeoutIds = new Set<number>();
        const intervalIds = new Set<number>();
        const nativeSetTimeout = window.setTimeout.bind(window);
        const nativeClearTimeout = window.clearTimeout.bind(window);
        const nativeSetInterval = window.setInterval.bind(window);
        const nativeClearInterval = window.clearInterval.bind(window);
        window.setTimeout = ((handler: TimerHandler, delay?: number, ...args: unknown[]) => {
            let id = 0;
            const wrapped = typeof handler === 'function'
                ? (...callbackArgs: unknown[]) => {
                    if (timeoutIds.delete(id)) timerState.timeouts = timeoutIds.size;
                    handler(...callbackArgs);
                }
                : handler;
            id = nativeSetTimeout(wrapped, delay, ...args);
            timeoutIds.add(id);
            timerState.timeouts = timeoutIds.size;
            return id;
        }) as typeof window.setTimeout;
        window.clearTimeout = ((id?: number) => {
            if (typeof id === 'number' && timeoutIds.delete(id)) timerState.timeouts = timeoutIds.size;
            nativeClearTimeout(id);
        }) as typeof window.clearTimeout;
        window.setInterval = ((handler: TimerHandler, delay?: number, ...args: unknown[]) => {
            const id = nativeSetInterval(handler, delay, ...args);
            intervalIds.add(id);
            timerState.intervals = intervalIds.size;
            return id;
        }) as typeof window.setInterval;
        window.clearInterval = ((id?: number) => {
            if (typeof id === 'number' && intervalIds.delete(id)) timerState.intervals = intervalIds.size;
            nativeClearInterval(id);
        }) as typeof window.clearInterval;
        window.__lpTimers = timerState;
        localStorage.clear();
    });
    await page.goto('/');
    await expect(page.locator('main')).toHaveAttribute('data-experience-surface', 'main-menu');
}

async function expectPaintedAboveCanvas(target: Locator) {
    const evidence = await target.evaluate(element => {
        const changed: Array<{ element: HTMLElement; pointerEvents: string }> = [];
        let current: HTMLElement | null = element as HTMLElement;
        while (current && current !== document.body) {
            changed.push({ element: current, pointerEvents: current.style.pointerEvents });
            current.style.pointerEvents = 'auto';
            current = current.parentElement;
        }
        const rect = element.getBoundingClientRect();
        const stack = document.elementsFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        const targetIndex = stack.indexOf(element);
        const canvasIndex = stack.findIndex(candidate => candidate.matches('#canvas-container canvas, #canvas-container'));
        for (const entry of changed) entry.element.style.pointerEvents = entry.pointerEvents;
        return {
            targetIndex,
            canvasIndex,
            stack: stack.slice(0, 8).map(candidate => `${candidate.tagName.toLowerCase()}#${candidate.id}.${candidate.className}`),
        };
    });
    expect(evidence.targetIndex, JSON.stringify(evidence.stack)).toBeGreaterThanOrEqual(0);
    expect(evidence.canvasIndex, JSON.stringify(evidence.stack)).toBeGreaterThan(evidence.targetIndex);
}

test('React shell owns navigation, extensions, solo mode, pause, layers, and lifecycle', async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('console', message => {
        if (message.type() === 'error') errors.push(`console: ${message.text()}`);
    });
    page.on('pageerror', error => errors.push(`page: ${error.message}`));
    await bootFresh(page);

    const main = page.locator('#main-menu');
    await expect(main).toBeVisible();
    await expect(page.locator('#main-play')).toBeFocused();
    await expect(main.getByRole('button')).toHaveCount(3);
    await expect(page.locator('#main-free-skate')).toBeEnabled();
    await expect(page.locator('body')).not.toContainText(/Shop|Rooms|Wallet|Moon Crate|SPL|Buy/i);
    await expect(page.locator('main')).toHaveAttribute('data-simulation-paused', 'true');
    await expect(page.locator('[data-experience-layer="canvas"]')).toHaveJSProperty('inert', true);
    await expect(page.locator('[data-experience-layer="hud"]')).toHaveAttribute('aria-hidden', 'true');

    const agentHud = page.locator('#extension-hud-root > #agent-hud');
    await expect(agentHud).toHaveCount(1);
    await expect(page.locator('body > #agent-hud')).toHaveCount(0);
    await expect(page.locator('[data-experience-layer="transient"] > #lp-toasts')).toHaveCount(1);
    await expect(page.locator('body > #lp-toasts')).toHaveCount(0);
    await expect(page.locator('[data-experience-layer="transient"] > #extension-transient-root')).toHaveCount(1);
    await expect.poll(() => page.evaluate(() => window.__lpWebSockets?.active)).toBe(1);

    const ownerKey = await page.locator('#agent-owner-key').inputValue();
    const eventResponse = await page.request.post('http://127.0.0.1:3001/agent/event', {
        headers: { Authorization: 'Bearer browser-agent-token' },
        data: {
            type: 'agent_status',
            harness: 'playwright',
            sessionId: `browser-${testInfo.project.name}`,
            project: 'Lunar Pup',
            message: 'Shell lifecycle test connected',
            timestamp: '2026-07-09T12:00:00.000Z',
            ownerKey,
        },
    });
    expect(eventResponse.ok()).toBe(true);
    // The HUD layer is covered at the main menu, so the delivered event shows
    // as panel state here; real visibility is asserted after entering play.
    await expect(agentHud).toHaveJSProperty('hidden', false);
    await expect(agentHud).toContainText('Shell lifecycle test connected');
    await expect(page.locator('[data-experience-layer="hud"]')).toHaveJSProperty('inert', true);

    const menuRects = await main.getByRole('button').evaluateAll(buttons => buttons.map(button => {
        const rect = button.getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
    }));
    for (const rect of menuRects) {
        expect(rect.width).toBeGreaterThanOrEqual(44);
        expect(rect.height).toBeGreaterThanOrEqual(44);
    }
    for (let index = 1; index < menuRects.length; index += 1) {
        expect(menuRects[index]!.top - menuRects[index - 1]!.bottom).toBeGreaterThanOrEqual(8);
    }

    await page.locator('#main-play').click();
    await expect(page.locator('main')).toHaveAttribute('data-experience-surface', 'play');
    await expect(page.locator('main')).toHaveAttribute('data-simulation-paused', 'false');
    await expect(page.locator('#menu-button')).toBeFocused();
    await expect(page.locator('[data-experience-layer="canvas"]')).toHaveJSProperty('inert', false);
    await expect(agentHud).toBeVisible();
    await expect(agentHud).toContainText('Shell lifecycle test connected');

    const layers = await page.evaluate(() => {
        const z = (name: string) => Number(getComputedStyle(document.querySelector<HTMLElement>(`[data-experience-layer="${name}"]`)!).zIndex);
        return { canvas: z('canvas'), hud: z('hud'), transient: z('transient'), menu: z('menu') };
    });
    expect(layers.canvas).toBeLessThan(layers.hud);
    expect(layers.hud).toBeLessThan(layers.transient);
    expect(layers.transient).toBeLessThan(layers.menu);

    for (const selector of ['#speedometer', '#trick-score', '#gamemode-hud', '#minimap-panel', '#speed-lines']) {
        const target = page.locator(selector);
        const evidence = await target.evaluate(element => {
            const rect = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            return { width: rect.width, height: rect.height, display: style.display, visibility: style.visibility };
        });
        expect(evidence.width).toBeGreaterThan(0);
        expect(evidence.height).toBeGreaterThan(0);
        expect(evidence.display).not.toBe('none');
        expect(evidence.visibility).toBe('visible');
        await expectPaintedAboveCanvas(target);
    }

    await page.keyboard.press('Escape');
    await expect(page.locator('main')).toHaveAttribute('data-experience-surface', 'pause-menu');
    await expect(page.locator('main')).toHaveAttribute('data-simulation-paused', 'true');
    await expect(page.locator('#pause-resume')).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(page.locator('#pause-quit')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('main')).toHaveAttribute('data-experience-surface', 'play');
    await expect(page.locator('main')).toHaveAttribute('data-simulation-paused', 'false');
    await expect(page.locator('#menu-button')).toBeFocused();

    await page.locator('#menu-button').click();
    await page.locator('#main-settings').click();
    await expect(page.locator('main')).toHaveAttribute('data-experience-surface', 'settings');
    await expect(page.locator('.lp-view-back')).toHaveText(/Back to menu/);
    await expect(page.locator('.lp-view-back')).toBeFocused();
    await page.locator('#tuning-maxSpeed').fill('2.4');
    await expect(page.locator('#tuning-maxSpeed')).toHaveValue('2.4');
    await page.locator('#open-controls').click();
    await expect(page.locator('main')).toHaveAttribute('data-experience-surface', 'controls');
    await page.keyboard.press('Escape');
    await expect(page.locator('main')).toHaveAttribute('data-experience-surface', 'settings');
    await expect(page.locator('#open-controls')).toBeFocused();

    await page.locator('#open-controls').click();
    await page.mouse.click(2, 2);
    await expect(page.locator('main')).toHaveAttribute('data-experience-surface', 'settings');
    await expect(page.locator('#open-controls')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('main')).toHaveAttribute('data-experience-surface', 'main-menu');
    await expect(page.locator('#main-settings')).toBeFocused();

    await page.locator('#main-settings').click();
    await expect(page.locator('#tuning-maxSpeed')).toHaveValue('2.4');
    await page.getByRole('button', { name: 'Reset' }).click();
    await expect(page.locator('#tuning-maxSpeed')).toHaveValue('0.8');
    await page.keyboard.press('Escape');

    await page.locator('#main-play').click();
    await expect(page.locator('main')).toHaveAttribute('data-experience-surface', 'play');
    await expect(page.locator('#gamemode-hud')).toBeVisible();
    await expect(page.locator('#gamemode-hud')).toContainText('Crater Circuit');
    await expect(page.locator('#gamemode-end-run')).toBeVisible();
    await expect(page.locator('[data-experience-layer="hud"] #gamemode-hud')).toHaveCount(1);
    await expect.poll(() => page.evaluate(() => window.__lpWebSockets?.active)).toBe(2);
    await page.locator('#gamemode-end-run').click();
    await expect(page.locator('[data-experience-layer="menu"] > #gamemode-results')).toBeVisible();
    await expect(page.locator('#gamemode-results')).toContainText('Run ended');
    await expect(page.locator('#gamemode-results')).toContainText('Practice result');
    await expect(page.locator('#gamemode-results')).toContainText('Score');
    await expect(page.locator('#gamemode-play-again')).toBeFocused();
    await expect(page.locator('[data-experience-layer="canvas"]')).toHaveJSProperty('inert', true);
    await expect(page.locator('main')).toHaveAttribute('data-simulation-paused', 'true');
    await page.screenshot({ path: `/tmp/lunarpup-concern15-result-${testInfo.project.name}.png`, fullPage: true });
    for (const selector of ['#gamemode-play-again', '#gamemode-keep-skating']) {
        const box = await page.locator(selector).boundingBox();
        expect(box?.width).toBeGreaterThanOrEqual(44);
        expect(box?.height).toBeGreaterThanOrEqual(44);
    }
    await page.locator('#gamemode-play-again').click();
    await expect(page.locator('#gamemode-results')).toHaveCount(0);
    await expect(page.locator('#gamemode-hud')).toBeVisible();
    await expect(page.locator('main')).toHaveAttribute('data-simulation-paused', 'false');
    await expect.poll(() => page.evaluate(() => window.__lpWebSockets?.active)).toBe(2);
    await page.locator('#gamemode-end-run').click();
    await expect(page.locator('#gamemode-play-again')).toBeFocused();
    await page.locator('#gamemode-keep-skating').click();
    await expect(page.locator('#gamemode-results')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => window.__lpWebSockets?.active)).toBe(1);

    const baselineLifecycle = await page.evaluate(() => ({
        listeners: { ...window.__lpWindowListeners },
        sockets: { ...window.__lpWebSockets },
        timers: { ...window.__lpTimers },
    }));
    for (let cycle = 0; cycle < 10; cycle += 1) {
        await page.locator('#menu-button').click();
        await expect(page.locator('#main-menu')).toHaveCount(1);
        await page.locator('#main-free-skate').click();
        await expect(page.locator('#menu-button')).toHaveCount(1);
    }
    expect(await page.evaluate(() => ({
        listeners: { ...window.__lpWindowListeners },
        sockets: { ...window.__lpWebSockets },
        timers: { ...window.__lpTimers },
    }))).toEqual(baselineLifecycle);
    await expect(page.locator('#main-menu')).toHaveCount(0);
    await expect(agentHud).toHaveCount(1);

    await page.locator('#menu-button').click();
    await page.screenshot({ path: `/tmp/lunarpup-concern14-${testInfo.project.name}.png`, fullPage: true });

    if (testInfo.project.name === 'narrow') {
        await page.locator('#main-settings').click();
        const targets = page.locator('#settings-view button:visible, #settings-view input:visible');
        for (let index = 0; index < await targets.count(); index += 1) {
            const box = await targets.nth(index).boundingBox();
            expect(box?.width).toBeGreaterThanOrEqual(44);
            expect(box?.height).toBeGreaterThanOrEqual(44);
        }
        await page.keyboard.press('Escape');
    } else {
        await page.setViewportSize({ width: 640, height: 360 });
        for (const selector of ['#main-play', '#main-free-skate', '#main-settings']) {
            const target = page.locator(selector);
            await target.scrollIntoViewIfNeeded();
            await expect(target).toBeInViewport();
            await expect(target).toBeEnabled();
        }
    }

    await page.emulateMedia({ reducedMotion: 'reduce' });
    const motion = await page.locator('.lp-overlay').evaluate(element => {
        const content = element.querySelector<HTMLElement>('.lp-view-content, .main-menu-content');
        return content ? getComputedStyle(content).transitionDuration : '0s';
    });
    expect(motion.split(',').every(duration => duration.trim() === '0s')).toBe(true);
    expect(errors).toEqual([]);
});
