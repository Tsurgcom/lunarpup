import { useEffect, useRef } from 'react';
import { setSpeedLines } from '../state.ts';
import { bindSpeedLinesLayer } from '../ui/speedLines.ts';

export function SpeedLines() {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const layer = ref.current;
        if (!layer) return;

        const lines = bindSpeedLinesLayer(layer);
        setSpeedLines(lines);

        return () => {
            setSpeedLines([]);
            layer.replaceChildren();
        };
    }, []);

    return <div id="speed-lines" ref={ref} />;
}
