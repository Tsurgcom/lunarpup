import type { CosmeticPackage, EquippedCosmetics } from '../cosmetics/registry.ts';
import { applyLocalCosmetics } from '../game/cosmetics.ts';
import { getApiBaseUrl } from '../net/protocol.ts';
import { setLocalEquippedCosmetics } from '../game/multiplayer.ts';
import { prefersReducedMotion } from './motion.ts';
import {
    buildReelStrip,
    isReelBusy,
    reelTransition,
    type ReelItem,
    type ReelPhase,
    type ReelStrip,
} from './lootboxReel.ts';

interface InventoryPayload {
    accountId: string;
    balance: number;
    tokenBalance: number | null;
    tokenMint: string | null;
    walletAddress: string | null;
    ownedIds: string[];
    equipped: EquippedCosmetics;
    catalog: CosmeticPackage[];
}

interface LootboxOddsPayload {
    box: string;
    price: number;
    duplicateRefund: number;
    odds: Record<string, number>;
}

interface LootboxOpenPayload {
    box: string;
    cost: number;
    seedCommitment: string;
    result: {
        cosmeticId: string;
        displayName: string;
        rarity: string;
        slot: string;
        duplicate: boolean;
    };
    refund: number;
    balance: number;
}

let panel: HTMLElement | null = null;
let state: InventoryPayload | null = null;
let errorText = '';
let loading = false;
let lootboxOdds: LootboxOddsPayload | null = null;
let lootboxResult: LootboxOpenPayload | null = null;
let openingLootbox = false;
let reelPhase: ReelPhase = 'idle';
let reelStrip: ReelStrip | null = null;
let accountId = '';
let activeCurrency: 'soft' | 'token' = 'soft';

export function setupCosmeticsUI(): void {
    accountId = localStorage.getItem('lunarpup.cosmetics.accountId') || `pup-${crypto.randomUUID().slice(0, 8)}`;
    localStorage.setItem('lunarpup.cosmetics.accountId', accountId);

    const element = document.createElement('section');
    element.id = 'cosmetics-panel';
    element.className = 'lp-panel lp-gameplay';
    element.setAttribute('aria-label', 'Cosmetics shop and inventory');
    document.body.appendChild(element);
    panel = element;
    renderLoading();
    void loadInventory();
}

async function loadInventory(): Promise<void> {
    loading = true;
    errorText = '';
    render();
    try {
        const [inventoryResponse, oddsResponse] = await Promise.all([
            fetch(`${getApiBaseUrl()}/api/cosmetics/inventory?accountId=${encodeURIComponent(accountId)}`),
            fetch(`${getApiBaseUrl()}/lootbox/odds`),
        ]);
        if (!inventoryResponse.ok) throw new Error(`Inventory failed (${inventoryResponse.status})`);
        if (!oddsResponse.ok) throw new Error(`Lootbox odds failed (${oddsResponse.status})`);
        state = await inventoryResponse.json() as InventoryPayload;
        lootboxOdds = await oddsResponse.json() as LootboxOddsPayload;
        applyEquipped();
    } catch (error) {
        errorText = error instanceof Error ? error.message : String(error);
    } finally {
        loading = false;
        render();
    }
}

async function buy(cosmeticId: string): Promise<void> {
    await postAction('/api/cosmetics/buy', { accountId, cosmeticId, currency: activeCurrency });
}

async function equip(cosmeticId: string, slot: string): Promise<void> {
    await postAction('/api/cosmetics/equip', { accountId, cosmeticId, slot });
}

async function openLootbox(): Promise<void> {
    if (!lootboxOdds || isReelBusy(reelPhase)) return;
    const reduced = prefersReducedMotion();
    openingLootbox = true;
    lootboxResult = null;
    reelStrip = null;
    errorText = '';
    // Pre-spin glow beat on the crate while the server roll is in flight
    // (skipped entirely under reduced motion — the result appears instantly).
    reelPhase = reduced ? 'idle' : reelTransition('idle', 'open');
    render();
    try {
        const response = await fetch(`${getApiBaseUrl()}/lootbox/open`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ accountId, box: lootboxOdds.box }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || `Lootbox failed (${response.status})`);
        lootboxResult = payload as LootboxOpenPayload;
        if (!reduced) {
            // Build the decelerating reel that lands on the won cosmetic.
            reelStrip = buildReelStrip(buildReelPool(), toReelItem(lootboxResult));
            reelPhase = reelTransition(reelPhase, 'result');
            render();
            await spinReel();
            reelPhase = reelTransition(reelPhase, 'settle');
        }
        await loadInventory();
    } catch (error) {
        errorText = error instanceof Error ? error.message : String(error);
        reelPhase = reelTransition(reelPhase, 'reset');
    } finally {
        openingLootbox = false;
        render();
    }
}

function toReelItem(open: LootboxOpenPayload): ReelItem {
    const pkg = state?.catalog.find(item => item.id === open.result.cosmeticId);
    return {
        id: open.result.cosmeticId,
        name: open.result.displayName,
        rarity: open.result.rarity,
        colors: pkg?.definition.visual.colors ?? [],
    };
}

function buildReelPool(): ReelItem[] {
    return (state?.catalog ?? []).map(item => ({
        id: item.id,
        name: item.manifest.displayName,
        rarity: item.definition.rarity,
        colors: item.definition.visual.colors,
    }));
}

const REEL_CELL_HEIGHT = 76;
const REEL_DURATION_MS = 2400;

function spinReel(): Promise<void> {
    const { promise, resolve } = Promise.withResolvers<void>();
    const reel = panel?.querySelector<HTMLElement>('.lootbox-reel');
    const track = panel?.querySelector<HTMLElement>('.lootbox-reel-track');
    if (!reel || !track || !reelStrip || prefersReducedMotion()) {
        resolve();
        return promise;
    }
    track.style.setProperty('--reel-duration', `${REEL_DURATION_MS}ms`);
    // Force layout so the transition runs from the resting offset.
    void reel.offsetWidth;
    reel.classList.add('lootbox-reel-spinning');
    track.style.transform = `translateY(-${reelStrip.winnerIndex * REEL_CELL_HEIGHT}px)`;
    let settled = false;
    const finish = () => {
        if (settled) return;
        settled = true;
        resolve();
    };
    track.addEventListener('transitionend', finish, { once: true });
    window.setTimeout(finish, REEL_DURATION_MS + 200);
    return promise;
}

async function postAction(path: string, body: Record<string, string>): Promise<void> {
    loading = true;
    errorText = '';
    render();
    try {
        const response = await fetch(`${getApiBaseUrl()}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`);
        state = payload as InventoryPayload;
        applyEquipped();
    } catch (error) {
        errorText = error instanceof Error ? error.message : String(error);
    } finally {
        loading = false;
        render();
    }
}

function applyEquipped(): void {
    if (!state) return;
    applyLocalCosmetics(state.equipped, state.catalog);
    setLocalEquippedCosmetics(state.equipped);
}

function renderLoading(): void {
    if (!panel) return;
    panel.innerHTML = `
        <div class="cosmetics-header">
            <h2 class="lp-panel-title">Cosmetics</h2>
            <span class="cosmetics-pill">Loading…</span>
        </div>
        <div class="cosmetics-skeleton" aria-hidden="true"></div>
        <div class="cosmetics-skeleton" aria-hidden="true"></div>
    `;
}

function render(): void {
    if (!panel) return;
    if (loading && !state) return renderLoading();
    if (errorText) {
        panel.innerHTML = `
            <div class="cosmetics-header"><h2 class="lp-panel-title">Cosmetics</h2></div>
            <p class="cosmetics-error">Couldn’t load cosmetics. ${escapeHtml(errorText)}</p>
            <button class="lp-button cosmetics-button" id="cosmetics-retry" type="button">Retry</button>
        `;
        panel.querySelector('#cosmetics-retry')?.addEventListener('click', () => void loadInventory());
        return;
    }
    if (!state || state.catalog.length === 0) {
        panel.innerHTML = `
            <div class="cosmetics-header"><h2 class="lp-panel-title">Cosmetics</h2></div>
            <p class="cosmetics-empty">No cosmetics are stocked yet.</p>
        `;
        return;
    }

    const owned = new Set(state.ownedIds);
    const tokenReady = state.walletAddress && state.tokenBalance !== null;
    const tokenLabel = tokenReady ? `${state.tokenBalance} devnet SPL` : 'Link wallet for SPL';
    panel.innerHTML = `
        <div class="cosmetics-header">
            <h2 class="lp-panel-title">Cosmetics</h2>
            <span class="cosmetics-pill">${state.balance} moon bones</span>
        </div>
        <p class="cosmetics-account">Inventory ${escapeHtml(state.accountId)}${state.walletAddress ? ` · wallet ${escapeHtml(shortAddress(state.walletAddress))}` : ''}</p>
        <div class="cosmetics-currency" role="group" aria-label="Shop currency">
            <button class="lp-button cosmetics-button ${activeCurrency === 'soft' ? 'cosmetics-button-active' : ''}" type="button" data-currency-soft>Moon bones</button>
            <button class="lp-button cosmetics-button ${activeCurrency === 'token' ? 'cosmetics-button-active' : ''}" type="button" data-currency-token ${tokenReady ? '' : 'disabled'}>${escapeHtml(tokenLabel)}</button>
        </div>
        ${lootboxPanel()}
        <div class="cosmetics-list">
            ${state.catalog.map(item => cosmeticCard(item, owned.has(item.id), state!.equipped[item.definition.slot] === item.id)).join('')}
        </div>
        ${errorText ? `<p class="cosmetics-error">${escapeHtml(errorText)}</p>` : ''}
    `;

    panel.querySelectorAll<HTMLButtonElement>('[data-buy]').forEach(button => {
        button.addEventListener('click', () => void buy(button.dataset.buy!));
    });
    panel.querySelectorAll<HTMLButtonElement>('[data-equip]').forEach(button => {
        button.addEventListener('click', () => void equip(button.dataset.equip!, button.dataset.slot!));
    });
    panel.querySelector<HTMLButtonElement>('[data-lootbox-open]')?.addEventListener('click', () => void openLootbox());
    panel.querySelector<HTMLButtonElement>('[data-currency-soft]')?.addEventListener('click', () => {
        activeCurrency = 'soft';
        render();
    });
    panel.querySelector<HTMLButtonElement>('[data-currency-token]')?.addEventListener('click', () => {
        activeCurrency = 'token';
        render();
    });
}

function lootboxPanel(): string {
    if (!lootboxOdds) return '<section class="lootbox-card"><div class="cosmetics-skeleton" aria-hidden="true"></div></section>';
    const odds = Object.entries(lootboxOdds.odds)
        .map(([rarity, chance]) => `<span class="lootbox-odd lp-rarity-${escapeHtml(rarity)}">${escapeHtml(rarity)} ${(chance * 100).toFixed(0)}%</span>`)
        .join('');
    const busy = openingLootbox || isReelBusy(reelPhase);
    return `
        <section class="lootbox-card" aria-busy="${busy}">
            <div class="lootbox-copy">
                <div>
                    <div class="cosmetics-card-title">Moon Crate</div>
                    <div class="cosmetics-meta">Server roll · ${lootboxOdds.price} moon bones · duplicate refund ${lootboxOdds.duplicateRefund}</div>
                </div>
                <button class="lp-button lp-button-primary cosmetics-button lootbox-open-button" type="button" data-lootbox-open ${busy || loading ? 'disabled' : ''}>${busy ? 'Opening…' : 'Open'}</button>
            </div>
            ${lootboxReveal()}
            <div class="lootbox-odds" aria-label="Published lootbox odds">${odds}</div>
        </section>
    `;
}

function lootboxReveal(): string {
    if (reelPhase === 'glow') {
        return '<div class="lootbox-reel-glow" role="status">Spinning up the crate…</div>';
    }
    if (reelPhase === 'spinning' && reelStrip) {
        const cells = reelStrip.cells.map(reelCell).join('');
        return `<div class="lootbox-reel" aria-hidden="true"><div class="lootbox-reel-track">${cells}</div></div>`;
    }
    if (lootboxResult) {
        const r = lootboxResult.result;
        const rarity = escapeHtml(r.rarity);
        return `<div class="lootbox-result lootbox-result-landed-${rarity}" role="status">
            <div class="lootbox-result-label">${r.duplicate ? 'Duplicate refund' : 'Unlocked cosmetic'}</div>
            <div class="lootbox-result-name lp-rarity-${rarity}">${escapeHtml(r.displayName)}</div>
            <div class="lootbox-result-meta">${rarity} · ${escapeHtml(r.slot)}${lootboxResult.refund ? ` · +${lootboxResult.refund} refund` : ''}</div>
        </div>`;
    }
    return '<div class="lootbox-result lootbox-result-empty">Open a Moon Crate to reveal a cosmetic.</div>';
}

function reelCell(item: ReelItem): string {
    const swatch = item.colors[0]
        ? `<span class="cosmetics-swatch" style="background:${escapeHtml(item.colors[0])}"></span>`
        : '';
    return `<div class="lootbox-reel-cell">${swatch}<span class="lootbox-reel-name lp-rarity-${escapeHtml(item.rarity)}">${escapeHtml(item.name)}</span></div>`;
}

function cosmeticCard(item: CosmeticPackage, owned: boolean, equipped: boolean): string {
    const colors = item.definition.visual.colors.map(color => `<span class="cosmetics-swatch" style="background:${escapeHtml(color)}"></span>`).join('');
    const canUseToken = Boolean(state?.walletAddress && state.tokenBalance !== null);
    const priceLabel = activeCurrency === 'token' && canUseToken ? `${item.price} devnet SPL` : `${item.price} moon bones`;
    const rarity = escapeHtml(item.definition.rarity);
    const action = owned
        ? `<button class="lp-button cosmetics-button" type="button" data-equip="${item.id}" data-slot="${item.definition.slot}" ${equipped ? 'disabled' : ''}>${equipped ? 'Equipped' : 'Equip'}</button>`
        : `<button class="lp-button lp-button-primary cosmetics-button" type="button" data-buy="${item.id}" ${loading || (activeCurrency === 'token' && !canUseToken) ? 'disabled' : ''}>Buy ${priceLabel}</button>`;
    return `
        <article class="cosmetics-card">
            <div>
                <div class="cosmetics-card-title">${escapeHtml(item.manifest.displayName)}</div>
                <div class="cosmetics-meta">${escapeHtml(item.definition.slot)} · <span class="lp-rarity-${rarity}">${rarity}</span></div>
                <div class="cosmetics-swatches" aria-label="Colors">${colors}</div>
            </div>
            ${action}
        </article>
    `;
}

function shortAddress(value: string): string {
    return value.length <= 10 ? value : `${value.slice(0, 4)}…${value.slice(-4)}`;
}

function escapeHtml(value: string): string {
    return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}
