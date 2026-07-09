const POLL_INTERVAL_MS = 60_000;

let loadedBuildId: string | null = null;
let bannerEl: HTMLDivElement | null = null;
let pollTimer: number | null = null;

async function fetchBuildId(): Promise<string | null> {
    try {
        const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return null;
        const data = await res.json() as { buildId?: string };
        return typeof data.buildId === 'string' ? data.buildId : null;
    } catch {
        return null;
    }
}

function showUpdateBanner() {
    if (bannerEl) return;

    bannerEl = document.createElement('div');
    bannerEl.id = 'update-notice';
    bannerEl.innerHTML = `
        <span>Update available — refresh to get the latest</span>
        <button type="button">Refresh</button>
    `;
    bannerEl.querySelector('button')?.addEventListener('click', () => {
        window.location.reload();
    });
    document.body.appendChild(bannerEl);
}

async function checkForUpdate() {
    const remoteBuildId = await fetchBuildId();
    if (!remoteBuildId) return;

    if (loadedBuildId === null) {
        loadedBuildId = remoteBuildId;
        return;
    }

    if (remoteBuildId !== loadedBuildId) {
        showUpdateBanner();
    }
}

export function setupUpdateNotice() {
    if (pollTimer) clearInterval(pollTimer);
    void checkForUpdate();
    pollTimer = window.setInterval(() => {
        void checkForUpdate();
    }, POLL_INTERVAL_MS);
}
