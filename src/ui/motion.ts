/**
 * Reduced-motion preference.
 *
 * CSS animations key off `@media (prefers-reduced-motion: reduce)` directly;
 * JS-driven motion (e.g. the main-menu camera orbit) consults
 * `prefersReducedMotion()`. The matcher is injectable so the decision is
 * testable without a DOM.
 */

export type MediaMatcher = (query: string) => { matches: boolean };

export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
export const REDUCED_MOTION_CLASS = 'lp-reduced-motion';

function defaultMatcher(): MediaMatcher | null {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
        return window.matchMedia.bind(window);
    }
    return null;
}

export function prefersReducedMotion(matcher: MediaMatcher | null = defaultMatcher()): boolean {
    if (!matcher) return false;
    try {
        return matcher(REDUCED_MOTION_QUERY).matches;
    } catch {
        return false;
    }
}
