import type { TrickScore } from '../game/trickScoring.ts';

interface TrickHudBinding {
    updateScore: (totalScore: number) => void;
    updateCurrent: (rotation: number, grabbing: boolean) => void;
    showResult: (result: TrickScore) => void;
}

let reactHud: TrickHudBinding | null = null;

export function bindTrickHud(binding: TrickHudBinding) {
    reactHud = binding;

    return () => {
        if (reactHud === binding) reactHud = null;
    };
}

export function updateTrickScore(totalScore: number) {
    reactHud?.updateScore(totalScore);
}

export function updateCurrentTrick(rotation: number, grabbing: boolean) {
    reactHud?.updateCurrent(rotation, grabbing);
}

export function showTrickResult(result: TrickScore) {
    reactHud?.showResult(result);
}
