import { useGame } from './GameProvider.tsx';

export function PresenceChip() {
    const { mpStatus, remotePlayerIds } = useGame();
    return (
        <div id="presence-chip" className="presence-chip lp-gameplay" aria-label="Multiplayer presence" title="Hold Tab for roster">
            <span className={`presence-dot presence-${mpStatus}`} aria-hidden="true" />
            <span className="presence-count lp-numeric">{1 + remotePlayerIds.length}</span>
        </div>
    );
}
