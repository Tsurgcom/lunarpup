import { useGame } from './GameProvider.tsx';

export function RosterOverlay({ visible = false }: { visible?: boolean }) {
    const { multiplayerConfig, remotePlayerIds, remotePlayersRef } = useGame();
    const remoteNames = remotePlayerIds
        .map((id) => remotePlayersRef.current.get(id)?.name)
        .filter((name): name is string => !!name);

    return (
        <div id="roster-overlay" className="roster-overlay" role="status" aria-label="Player roster" hidden={!visible}>
            <div className="roster-card">
                <p className="lp-view-eyebrow">In this session</p>
                <div id="roster-list" className="roster-list">
                    <div className="roster-row roster-self"><span>{multiplayerConfig?.name ?? 'You'}</span><span className="roster-you">you</span></div>
                    {remoteNames.map((name) => <div className="roster-row" key={name}><span>{name}</span></div>)}
                </div>
            </div>
        </div>
    );
}
