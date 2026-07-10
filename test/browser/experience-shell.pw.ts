import { expect, test, type Page } from '@playwright/test';

declare global {
    interface Window {
        __lpWindowListeners?: Record<string, number>;
    }
}

async function bootFresh(page: Page) {
    await page.addInitScript(() => {
        const balances: Record<string, number> = {};
        const add = EventTarget.prototype.addEventListener;
        const remove = EventTarget.prototype.removeEventListener;
        EventTarget.prototype.addEventListener = function (type, listener, options) {
            if (this === window && ['keydown', 'keyup', 'blur'].includes(type)) {
                balances[type] = (balances[type] ?? 0) + 1;
            }
            return add.call(this, type, listener as EventListenerOrEventListenerObject, options);
        };
        EventTarget.prototype.removeEventListener = function (type, listener, options) {
            if (this === window && ['keydown', 'keyup', 'blur'].includes(type)) {
                balances[type] = (balances[type] ?? 0) - 1;
            }
            return remove.call(this, type, listener as EventListenerOrEventListenerObject, options);
        };
        window.__lpWindowListeners = balances;
        localStorage.clear();
    });
    await page.goto('/');
    await expect(page.locator('main')).toHaveAttribute('data-experience-surface', 'main-menu');
}

test('React shell owns navigation, focus, pause, layers, and lifecycle', async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('console', message => {
        if (message.type() === 'error') errors.push(`console: ${message.text()}`);
    });
    page.on('pageerror', error => errors.push(`page: ${error.message}`));
    await bootFresh(page);

    const main = page.locator('#main-menu');
    await expect(main).toBeVisible();
    await expect(page.locator('#main-play')).toBeFocused();
    await expect(main.getByRole('button')).toHaveCount(2);
    await expect(page.locator('body')).not.toContainText(/Shop|Rooms|Wallet|Moon Crate|SPL|Buy/i);
    await expect(page.locator('[data-experience-layer="canvas"]')).toHaveJSProperty('inert', true);
    await expect(page.locator('[data-experience-layer="hud"]')).toHaveAttribute('aria-hidden', 'true');

    await page.locator('#main-play').click();
    await expect(page.locator('main')).toHaveAttribute('data-experience-surface', 'play');
    await expect(page.locator('#menu-button')).toBeFocused();
    await expect(page.locator('[data-experience-layer="canvas"]')).toHaveJSProperty('inert', false);

    const layers = await page.evaluate(() => {
        const z = (name: string) => Number(getComputedStyle(document.querySelector<HTMLElement>(`[data-experience-layer="${name}"]`)!).zIndex);
        return { canvas: z('canvas'), hud: z('hud'), transient: z('transient'), menu: z('menu') };
    });
    expect(layers.canvas).toBeLessThan(layers.hud);
    expect(layers.hud).toBeLessThan(layers.transient);
    expect(layers.transient).toBeLessThan(layers.menu);

    for (const selector of ['#speedometer', '#trick-score', '#minimap-panel', '#speed-lines']) {
        const evidence = await page.locator(selector).evaluate(element => {
            const rect = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            return { width: rect.width, height: rect.height, display: style.display, visibility: style.visibility };
        });
        expect(evidence.width).toBeGreaterThan(0);
        expect(evidence.height).toBeGreaterThan(0);
        expect(evidence.display).not.toBe('none');
        expect(evidence.visibility).toBe('visible');
    }

    await page.keyboard.press('Escape');
    await expect(page.locator('main')).toHaveAttribute('data-experience-surface', 'pause-menu');
    await expect(page.locator('#pause-resume')).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(page.locator('#pause-quit')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('main')).toHaveAttribute('data-experience-surface', 'play');
    await expect(page.locator('#menu-button')).toBeFocused();

    await page.locator('#menu-button').click();
    await page.locator('#main-settings').click();
    await expect(page.locator('main')).toHaveAttribute('data-experience-surface', 'settings');
    await expect(page.locator('.lp-view-back')).toHaveText(/Back to menu/);
    await expect(page.locator('.lp-view-back')).toBeFocused();
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

    await page.locator('#main-play').click();
    const baselineListeners = await page.evaluate(() => ({ ...window.__lpWindowListeners }));
    for (let cycle = 0; cycle < 10; cycle += 1) {
        await page.locator('#menu-button').click();
        await expect(page.locator('#main-menu')).toHaveCount(1);
        await page.locator('#main-play').click();
        await expect(page.locator('#menu-button')).toHaveCount(1);
    }
    expect(await page.evaluate(() => ({ ...window.__lpWindowListeners }))).toEqual(baselineListeners);
    await expect(page.locator('#main-menu')).toHaveCount(0);

    if (testInfo.project.name === 'narrow') {
        await page.locator('#menu-button').click();
        for (const selector of ['#main-play', '#main-settings']) {
            const box = await page.locator(selector).boundingBox();
            expect(box?.width).toBeGreaterThanOrEqual(44);
            expect(box?.height).toBeGreaterThanOrEqual(44);
        }
    } else {
        await page.locator('#menu-button').click();
    }

    await page.screenshot({ path: `/tmp/lunarpup-concern14-${testInfo.project.name}.png`, fullPage: true });

    if (testInfo.project.name === 'narrow') {
        await page.locator('#main-settings').click();
        const targets = page.locator('#settings-view button:visible, #settings-view input:visible');
        for (let index = 0; index < await targets.count(); index += 1) {
            const box = await targets.nth(index).boundingBox();
            expect(box?.width).toBeGreaterThanOrEqual(44);
            expect(box?.height).toBeGreaterThanOrEqual(44);
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
