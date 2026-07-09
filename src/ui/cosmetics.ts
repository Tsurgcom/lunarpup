import type { CosmeticPackage, EquippedCosmetics } from '../cosmetics/registry.ts';
import { applyLocalCosmetics } from '../game/cosmetics.ts';
import { getApiBaseUrl } from '../net/protocol.ts';
import { setLocalEquippedCosmetics } from '../game/multiplayer.ts';

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
let accountId = '';
let activeCurrency: 'soft' | 'token' = 'soft';

export function setupCosmeticsUI(): void {
    accountId = localStorage.getItem('lunarpup.cosmetics.accountId') || `pup-${crypto.randomUUID().slice(0, 8)}`;
    localStorage.setItem('lunarpup.cosmetics.accountId', accountId);

    const element = document.createElement('section');
    element.id = 'cosmetics-panel';
    element.setAttribute('aria-label', 'Cosmetics shop and inventory');
    document.body.appendChild(element);
    panel = element;
    renderLoading();
    void loadInventory();
}

async function loadInventory(): Promise<void> {
    loading = true;
    errorText = '';
    renderLoading();
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
    if (!lootboxOdds) return;
    openingLootbox = true;
    lootboxResult = null;
    errorText = '';
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
        await loadInventory();
    } catch (error) {
        errorText = error instanceof Error ? error.message : String(error);
    } finally {
        openingLootbox = false;
        render();
    }
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
            <h2>Cosmetics</h2>
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
            <div class="cosmetics-header"><h2>Cosmetics</h2></div>
            <p class="cosmetics-error">Couldn’t load cosmetics. ${escapeHtml(errorText)}</p>
            <button class="cosmetics-button" id="cosmetics-retry" type="button">Retry</button>
        `;
        panel.querySelector('#cosmetics-retry')?.addEventListener('click', () => void loadInventory());
        return;
    }
    if (!state || state.catalog.length === 0) {
        panel.innerHTML = `
            <div class="cosmetics-header"><h2>Cosmetics</h2></div>
            <p class="cosmetics-empty">No cosmetics are stocked yet.</p>
        `;
        return;
    }

    const owned = new Set(state.ownedIds);
    const tokenReady = state.walletAddress && state.tokenBalance !== null;
    const tokenLabel = tokenReady ? `${state.tokenBalance} devnet SPL` : 'Link wallet for SPL';
    panel.innerHTML = `
        <div class="cosmetics-header">
            <h2>Cosmetics</h2>
            <span class="cosmetics-pill">${state.balance} moon bones</span>
        </div>
        <p class="cosmetics-account">Inventory ${escapeHtml(state.accountId)}${state.walletAddress ? ` · wallet ${escapeHtml(shortAddress(state.walletAddress))}` : ''}</p>
        <div class="cosmetics-currency" role="group" aria-label="Shop currency">
            <button class="cosmetics-button ${activeCurrency === 'soft' ? 'cosmetics-button-active' : ''}" type="button" data-currency-soft>Moon bones</button>
            <button class="cosmetics-button ${activeCurrency === 'token' ? 'cosmetics-button-active' : ''}" type="button" data-currency-token ${tokenReady ? '' : 'disabled'}>${escapeHtml(tokenLabel)}</button>
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
        .map(([rarity, chance]) => `<span class="lootbox-odd lootbox-rarity-${escapeHtml(rarity)}">${escapeHtml(rarity)} ${(chance * 100).toFixed(0)}%</span>`)
        .join('');
    const result = lootboxResult
        ? `<div class="lootbox-result lootbox-rarity-${escapeHtml(lootboxResult.result.rarity)}" role="status">
            <div class="lootbox-result-label">${lootboxResult.result.duplicate ? 'Duplicate refund' : 'Unlocked cosmetic'}</div>
            <div class="lootbox-result-name">${escapeHtml(lootboxResult.result.displayName)}</div>
            <div class="lootbox-result-meta">${escapeHtml(lootboxResult.result.rarity)} · ${lootboxResult.result.slot}${lootboxResult.refund ? ` · +${lootboxResult.refund} refund` : ''}</div>
        </div>`
        : '<div class="lootbox-result lootbox-result-empty">Open a Moon Crate to reveal a cosmetic.</div>';
    return `
        <section class="lootbox-card" aria-busy="${openingLootbox}">
            <div class="lootbox-copy">
                <div>
                    <div class="cosmetics-card-title">Moon Crate</div>
                    <div class="cosmetics-meta">Server roll · ${lootboxOdds.price} moon bones · duplicate refund ${lootboxOdds.duplicateRefund}</div>
                </div>
                <button class="cosmetics-button lootbox-open-button" type="button" data-lootbox-open ${openingLootbox || loading ? 'disabled' : ''}>${openingLootbox ? 'Opening…' : 'Open'}</button>
            </div>
            <div class="lootbox-animation ${openingLootbox ? 'lootbox-animation-opening' : ''}" aria-hidden="true">
                <span></span><span></span><span></span>
            </div>
            <div class="lootbox-odds" aria-label="Published lootbox odds">${odds}</div>
            ${result}
        </section>
    `;
}

function cosmeticCard(item: CosmeticPackage, owned: boolean, equipped: boolean): string {
    const colors = item.definition.visual.colors.map(color => `<span class="cosmetics-swatch" style="background:${escapeHtml(color)}"></span>`).join('');
    const canUseToken = Boolean(state?.walletAddress && state.tokenBalance !== null);
    const priceLabel = activeCurrency === 'token' && canUseToken ? `${item.price} devnet SPL` : `${item.price} moon bones`;
    const action = owned
        ? `<button class="cosmetics-button" type="button" data-equip="${item.id}" data-slot="${item.definition.slot}" ${equipped ? 'disabled' : ''}>${equipped ? 'Equipped' : 'Equip'}</button>`
        : `<button class="cosmetics-button" type="button" data-buy="${item.id}" ${loading || (activeCurrency === 'token' && !canUseToken) ? 'disabled' : ''}>Buy ${priceLabel}</button>`;
    return `
        <article class="cosmetics-card">
            <div>
                <div class="cosmetics-card-title">${escapeHtml(item.manifest.displayName)}</div>
                <div class="cosmetics-meta">${item.definition.slot} · ${item.definition.rarity}</div>
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
