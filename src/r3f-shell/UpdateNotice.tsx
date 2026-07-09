import { useEffect } from 'react';
import { bindUpdateNotice } from '../ui/updateNotice.ts';

/**
 * Starts build-version polling. The notification itself is rendered by the
 * reskin toast system (`showToast` in `../ui/updateNotice.ts`), so this
 * component owns only the polling lifecycle and renders no DOM.
 */
export function UpdateNotice() {
    useEffect(() => bindUpdateNotice(), []);
    return null;
}
