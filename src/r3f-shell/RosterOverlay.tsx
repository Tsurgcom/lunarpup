import { useEffect, useRef } from 'react';
import { bindRoster } from '../ui/multiplayer.ts';

/**
 * Hold-Tab roster (FPS-scoreboard pattern): a transient overlay listing every
 * pup in the session. Shown only while Tab is held (wired in gameSystems), and
 * only in multiplayer. The list is populated imperatively from the network
 * layer.
 */
export function RosterOverlay() {
    const listRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const list = listRef.current;
        if (!list) return;
        return bindRoster(list);
    }, []);

    return (
        <div id="roster-overlay" className="roster-overlay" role="dialog" aria-label="Player roster" hidden>
            <div className="roster-card">
                <p className="lp-view-eyebrow">In this session</p>
                <div id="roster-list" ref={listRef} className="roster-list" />
            </div>
        </div>
    );
}
