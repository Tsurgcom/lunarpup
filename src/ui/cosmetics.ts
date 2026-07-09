import type { CosmeticPackage, EquippedCosmetics } from '../cosmetics/registry.ts';
import { applyLocalCosmetics } from '../game/cosmetics.ts';
import { setLocalEquippedCosmetics } from '../game/multiplayer.ts';

interface InventoryPayload {
    accountId: string;
    balance: number;
    ownedIds: string[];
    equipped: EquippedCosmetics;
    catalog: CosmeticPackage[];
}

let panel: HTMLElement | null = null;
let state: InventoryPayload | null = null;
let errorText = '';
let loading = false;
let accountId = '';

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
        const response = await fetch(`/api/cosmetics/inventory?accountId=${encodeURIComponent(accountId)}`);
        if (!response.ok) throw new Error(`Inventory failed (${response.status})`);
        state = await response.json() as InventoryPayload;
        applyEquipped();
    } catch (error) {
        errorText = error instanceof Error ? error.message : String(error);
    } finally {
        loading = false;
        render();
    }
}

async function buy(cosmeticId: string): Promise<void> {
    await postAction('/api/cosmetics/buy', { accountId, cosmeticId });
}

async function equip(cosmeticId: string, slot: string): Promise<void> {
    await postAction('/api/cosmetics/equip', { accountId, cosmeticId, slot });
}

async function postAction(path: string, body: Record<string, string>): Promise<void> {
    loading = true;
    errorText = '';
    render();
    try {
        const response = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
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
    panel.innerHTML = `
        <div class="cosmetics-header">
            <h2>Cosmetics</h2>
            <span class="cosmetics-pill">${state.balance} moon bones</span>
        </div>
        <p class="cosmetics-account">Inventory ${escapeHtml(state.accountId)}</p>
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
}

function cosmeticCard(item: CosmeticPackage, owned: boolean, equipped: boolean): string {
    const colors = item.definition.visual.colors.map(color => `<span class="cosmetics-swatch" style="background:${escapeHtml(color)}"></span>`).join('');
    const action = owned
        ? `<button class="cosmetics-button" type="button" data-equip="${item.id}" data-slot="${item.definition.slot}" ${equipped ? 'disabled' : ''}>${equipped ? 'Equipped' : 'Equip'}</button>`
        : `<button class="cosmetics-button" type="button" data-buy="${item.id}" ${loading ? 'disabled' : ''}>Buy ${item.price}</button>`;
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

function escapeHtml(value: string): string {
    return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}
