import { useEffect, useRef } from 'react';
import { createSpeedLines, updateSpeedLines } from './speedLinesUtil.ts';
import { useGame } from './GameProvider.tsx';

export function SpeedLines() {
    const { runtime } = useGame();
    const ref = useRef<HTMLDivElement>(null);
    const linesRef = useRef<HTMLDivElement[]>([]);

    useEffect(() => {
        const layer = ref.current;
        if (!layer) return;

        linesRef.current = createSpeedLines(layer);
        runtime.current.frameHud.updateSpeedLines = (speedRatio, isBoosting) => {
            updateSpeedLines(linesRef.current, layer, speedRatio, isBoosting);
        };

        return () => {
            delete runtime.current.frameHud.updateSpeedLines;
            linesRef.current = [];
            layer.replaceChildren();
        };
    }, [runtime]);

    return <div id="speed-lines" className="lp-gameplay" ref={ref} />;
}
