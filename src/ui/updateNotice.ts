const POLL_INTERVAL_MS = 60_000;

let loadedBuildId: string | null = null;
let pollTimer: number | null = null;
let reactNotifier: (() => void) | null = null;

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

async function checkForUpdate() {
    const remoteBuildId = await fetchBuildId();
    if (!remoteBuildId) return;

    if (loadedBuildId === null) {
        loadedBuildId = remoteBuildId;
        return;
    }

    if (remoteBuildId !== loadedBuildId) {
        reactNotifier?.();
    }
}

function startPolling() {
    if (pollTimer) clearInterval(pollTimer);
    void checkForUpdate();
    pollTimer = window.setInterval(() => {
        void checkForUpdate();
    }, POLL_INTERVAL_MS);
}

export function bindUpdateNotice(onAvailable: () => void) {
    reactNotifier = onAvailable;
    startPolling();

    return () => {
        if (reactNotifier === onAvailable) reactNotifier = null;
        if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
        }
    };
}
