import { useEffect, useRef } from 'react';
import { bindSpeedHud } from '../ui/speedHud.ts';

export function SpeedHud() {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const element = ref.current;
        if (!element) return;

        return bindSpeedHud(element);
    }, []);

    return <div id="speedometer" ref={ref}>0.0 U/S  | chunks 0</div>;
}
