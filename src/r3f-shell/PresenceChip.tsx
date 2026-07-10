import { useEffect, useRef } from 'react';
import { bindPresenceChip } from '../ui/multiplayer.ts';

/**
 * Ambient multiplayer presence: a connection dot + pup count pinned top-right,
 * next to the minimap. Only rendered in multiplayer. Hold Tab for the full
 * roster (see RosterOverlay). Updated imperatively from the network layer so it
 * never triggers a React render.
 */
export function PresenceChip() {
    const dotRef = useRef<HTMLSpanElement>(null);
    const countRef = useRef<HTMLSpanElement>(null);

    useEffect(() => {
        const dot = dotRef.current;
        const count = countRef.current;
        if (!dot || !count) return;
        return bindPresenceChip(dot, count);
    }, []);

    return (
        <div id="presence-chip" className="presence-chip lp-gameplay" aria-label="Multiplayer presence" title="Hold Tab for roster">
            <span ref={dotRef} className="presence-dot presence-disconnected" aria-hidden="true" />
            <span ref={countRef} className="presence-count lp-numeric">1</span>
        </div>
    );
}
