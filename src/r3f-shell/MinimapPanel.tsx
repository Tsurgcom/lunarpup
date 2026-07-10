import { useEffect, useRef } from 'react';
import { drawMinimap, MINIMAP_SIZE, resetMinimapCache } from './minimapDraw.ts';
import { useGame } from './GameProvider.tsx';
import { getPlayerRoot } from '../game/runtime.ts';

export function MinimapPanel() {
    const { runtime, remotePlayersRef } = useGame();
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        resetMinimapCache();
        runtime.current.frameHud.redrawMinimap = () => {
            const root = getPlayerRoot(runtime.current);
            if (!root) return;

            drawMinimap(ctx, {
                playerX: root.position.x,
                playerZ: root.position.z,
                markers: [
                    ...[...remotePlayersRef.current.values()].map((remote) => ({
                        x: remote.current.x,
                        z: remote.current.z,
                        color: remote.color,
                        radius: 4,
                    })),
                    {
                        x: root.position.x,
                        z: root.position.z,
                        color: runtime.current.multiplayerClient?.color ?? 0xffb703,
                        radius: 5,
                        pulse: true,
                    },
                ],
            });
        };

        return () => {
            delete runtime.current.frameHud.redrawMinimap;
            resetMinimapCache();
        };
    }, [remotePlayersRef, runtime]);

    return (
        <section id="minimap-panel" className="lp-gameplay" aria-label="Map">
            <canvas
                ref={canvasRef}
                className="minimap-canvas"
                width={MINIMAP_SIZE}
                height={MINIMAP_SIZE}
                aria-label="Terrain map with player positions"
            />
        </section>
    );
}
