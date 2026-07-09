import { useEffect, useState } from 'react';

const POLL_INTERVAL_MS = 60_000;

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

export function UpdateNotice() {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        let loadedBuildId: string | null = null;
        let pollTimer: number | null = null;

        async function checkForUpdate() {
            const remoteBuildId = await fetchBuildId();
            if (!remoteBuildId) return;

            if (loadedBuildId === null) {
                loadedBuildId = remoteBuildId;
                return;
            }

            if (remoteBuildId !== loadedBuildId) {
                setVisible(true);
            }
        }

        void checkForUpdate();
        pollTimer = window.setInterval(() => {
            void checkForUpdate();
        }, POLL_INTERVAL_MS);

        return () => {
            if (pollTimer) clearInterval(pollTimer);
        };
    }, []);

    if (!visible) return null;

    return (
        <div id="update-notice" role="status">
            <span>Update available — refresh to get the latest</span>
            <button type="button" onClick={() => window.location.reload()}>Refresh</button>
        </div>
    );
}
