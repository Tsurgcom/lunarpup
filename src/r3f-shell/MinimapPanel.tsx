import { useEffect, useRef } from 'react';
import { bindMinimapCanvas } from '../ui/minimap.ts';

const SIZE = 132;

export function MinimapPanel() {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        return bindMinimapCanvas(canvas);
    }, []);

    return (
        <section id="minimap-panel" className="lp-panel lp-gameplay" aria-label="Map">
            <h2 className="lp-panel-title">🗺️ Map</h2>
            <canvas
                ref={canvasRef}
                className="minimap-canvas"
                width={SIZE}
                height={SIZE}
                aria-label="Terrain map with player positions"
            />
        </section>
    );
}
