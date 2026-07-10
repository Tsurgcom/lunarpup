/**
 * `?dev=1` gate. The raw Live Tuning panel (copy-to-hardcode textarea) is a
 * developer tool and stays invisible to players unless dev mode is on. Reading
 * the flag is pure over a query string so the gate is testable without a
 * `location`.
 */

function defaultSearch(): string {
    return typeof location !== 'undefined' ? location.search : '';
}

/** True for `?dev`, `?dev=1`, `?dev=true`; false otherwise. */
export function isDevMode(search: string = defaultSearch()): boolean {
    try {
        const value = new URLSearchParams(search).get('dev');
        if (value === null) return false;
        return value === '' || value === '1' || value === 'true';
    } catch {
        return false;
    }
}
