export const FULL_TURN = Math.PI * 2;
export const CLEAN_LANDING_TOLERANCE = Math.PI / 6;
export const MIN_GRAB_TIME = 0.35;
export const MIN_SPIN_ATTEMPT = Math.PI / 4;

export interface TrickScore {
    status: 'scored' | 'sketchy' | 'none';
    name: string;
    points: number;
    spinDegrees: number;
    spinCount: number;
    hasGrab: boolean;
}

export function scoreTrick(rotation: number, grabTime: number): TrickScore {
    const absoluteRotation = Math.abs(rotation);
    const spinDegrees = Math.round(absoluteRotation * 180 / Math.PI);
    const spinCount = Math.round(absoluteRotation / FULL_TURN);
    const attemptedSpin = absoluteRotation >= MIN_SPIN_ATTEMPT;
    const cleanSpin = spinCount >= 1
        && Math.abs(absoluteRotation - spinCount * FULL_TURN) <= CLEAN_LANDING_TOLERANCE;
    const hasGrab = grabTime >= MIN_GRAB_TIME;

    if (attemptedSpin && !cleanSpin) {
        return {
            status: 'sketchy',
            name: 'Sketchy landing',
            points: 0,
            spinDegrees,
            spinCount: 0,
            hasGrab,
        };
    }

    if (!cleanSpin && !hasGrab) {
        return {
            status: 'none',
            name: '',
            points: 0,
            spinDegrees,
            spinCount: 0,
            hasGrab: false,
        };
    }

    const spinPoints = cleanSpin ? 300 + (spinCount - 1) * 400 : 0;
    const grabPoints = hasGrab ? 150 : 0;
    const combinationMultiplier = cleanSpin && hasGrab ? 1.5 : 1;
    const points = Math.round((spinPoints + grabPoints) * combinationMultiplier);
    const name = [cleanSpin ? `${spinCount * 360}°` : '', hasGrab ? 'Moon Grab' : '']
        .filter(Boolean)
        .join(' ');

    return {
        status: 'scored',
        name,
        points,
        spinDegrees,
        spinCount: cleanSpin ? spinCount : 0,
        hasGrab,
    };
}
