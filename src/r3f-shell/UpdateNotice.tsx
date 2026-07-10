import { useEffect } from 'react';
import { showToast } from '../ui/toast.ts';

const POLL_INTERVAL_MS = 60_000;

async function fetchBuildId(): Promise<string | null> {
    try {
        const response = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!response.ok) return null;
        const data = await response.json() as { buildId?: string };
        return typeof data.buildId === 'string' ? data.buildId : null;
    } catch {
        return null;
    }
}

export function UpdateNotice() {
    useEffect(() => {
        let loadedBuildId: string | null = null;
        let bannerShown = false;
        let toastHandle: ReturnType<typeof showToast> | null = null;

        async function checkForUpdate() {
            const remoteBuildId = await fetchBuildId();
            if (!remoteBuildId) return;
            if (loadedBuildId === null) {
                loadedBuildId = remoteBuildId;
                return;
            }
            if (remoteBuildId !== loadedBuildId && !bannerShown) {
                bannerShown = true;
                toastHandle = showToast({
                    message: 'Update available — refresh to get the latest',
                    actionLabel: 'Refresh',
                    onAction: () => window.location.reload(),
                    durationMs: null,
                });
            }
        }

        void checkForUpdate();
        const pollTimer = window.setInterval(() => void checkForUpdate(), POLL_INTERVAL_MS);
        return () => {
            window.clearInterval(pollTimer);
            toastHandle?.dismiss();
        };
    }, []);

    return null;
}
