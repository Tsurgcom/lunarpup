import { useEffect, useState } from 'react';
import { bindUpdateNotice } from '../ui/updateNotice.ts';

export function UpdateNotice() {
    const [visible, setVisible] = useState(false);

    useEffect(() => bindUpdateNotice(() => setVisible(true)), []);

    if (!visible) return null;

    return (
        <div id="update-notice" role="status">
            <span>Update available — refresh to get the latest</span>
            <button type="button" onClick={() => window.location.reload()}>Refresh</button>
        </div>
    );
}
