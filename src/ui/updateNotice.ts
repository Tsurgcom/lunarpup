import { showToast } from './toast.ts';

const POLL_INTERVAL_MS = 60_000;

let loadedBuildId: string | null = null;
let bannerShown = false;

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
    if (bannerShown) return;
    bannerShown = true;
    showToast({
        message: 'Update available — refresh to get the latest',
        actionLabel: 'Refresh',
        onAction: () => window.location.reload(),
        durationMs: null,
    });
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
    void checkForUpdate();
    window.setInterval(() => {
        void checkForUpdate();
    }, POLL_INTERVAL_MS);
}
