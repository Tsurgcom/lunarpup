import { useEffect, useRef } from 'react';
import type { TrickScore } from '../game/trickScoring.ts';
import { useGame } from './GameProvider.tsx';

function getCurrentTrickLabel(rotation: number, grabbing: boolean) {
    const degrees = Math.round(Math.abs(rotation) * 180 / Math.PI);
    return [degrees >= 10 ? `SPIN ${degrees}°` : '', grabbing ? 'MOON GRAB' : '']
        .filter(Boolean)
        .join(' · ');
}

export function TrickHud() {
    const { runtime } = useGame();
    const scoreRef = useRef<HTMLDivElement>(null);
    const currentRef = useRef<HTMLDivElement>(null);
    const resultRef = useRef<HTMLDivElement>(null);
    const resultTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        runtime.current.frameHud.updateTrickScore = (totalScore) => {
            if (scoreRef.current) scoreRef.current.textContent = `SCORE ${totalScore.toLocaleString()}`;
        };
        runtime.current.frameHud.updateCurrentTrick = (rotation, grabbing) => {
            const current = currentRef.current;
            if (!current) return;
            const label = getCurrentTrickLabel(rotation, grabbing);
            current.textContent = label;
            current.classList.toggle('visible', label.length > 0);
        };
        runtime.current.frameHud.showTrickResult = (result: TrickScore) => {
            const resultElement = resultRef.current;
            if (!resultElement || result.status === 'none') return;

            if (resultTimerRef.current) clearTimeout(resultTimerRef.current);
            resultElement.textContent = result.status === 'scored'
                ? `${result.name}  +${result.points}`
                : result.name;
            resultElement.className = result.status === 'scored' ? 'landed' : 'sketchy';
            void resultElement.offsetWidth;
            resultElement.classList.add('visible');

            resultTimerRef.current = setTimeout(() => {
                resultElement.classList.remove('visible');
                resultTimerRef.current = null;
            }, 1400);
        };

        return () => {
            delete runtime.current.frameHud.updateTrickScore;
            delete runtime.current.frameHud.updateCurrentTrick;
            delete runtime.current.frameHud.showTrickResult;
        };
    }, [runtime]);

    useEffect(() => () => {
        if (resultTimerRef.current) clearTimeout(resultTimerRef.current);
    }, []);

    return (
        <section id="trick-hud">
            <div id="trick-score" ref={scoreRef}>SCORE 0</div>
            <div id="trick-current" ref={currentRef} />
            <div id="trick-result" ref={resultRef} role="status" aria-live="polite" aria-atomic="true" />
        </section>
    );
}
