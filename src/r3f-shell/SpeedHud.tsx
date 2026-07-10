import { useEffect, useRef } from 'react';
import { useGame } from './GameProvider.tsx';

export function SpeedHud() {
    const { runtime } = useGame();
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        runtime.current.frameHud.setSpeedText = (text) => {
            if (ref.current) ref.current.textContent = text;
        };

        return () => {
            if (runtime.current.frameHud.setSpeedText) {
                delete runtime.current.frameHud.setSpeedText;
            }
        };
    }, [runtime]);

    return <div id="speedometer" className="lp-gameplay" ref={ref}>0.0 U/S  | chunks 0</div>;
}
