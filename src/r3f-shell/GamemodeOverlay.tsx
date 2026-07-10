import { useEffect, useRef, useSyncExternalStore, type KeyboardEvent, type RefObject } from 'react';
import { pauseController } from '../game/pause.ts';
import {
    bindGamemodeHud,
    dismissGamemodeResults,
    endGamemode,
    formatRunTime,
    getGamemodePresentation,
    retryGamemode,
    retryLeaderboard,
    subscribeGamemodePresentation,
    type GamemodePresentation,
    type GamemodeResultView,
    type LeaderboardView,
} from '../modes/client.ts';

const FOCUSABLE = 'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

export function useGamemodePresentation(): GamemodePresentation {
    return useSyncExternalStore(
        subscribeGamemodePresentation,
        getGamemodePresentation,
        getGamemodePresentation,
    );
}

function required<T extends HTMLElement>(ref: RefObject<T | null>): T {
    if (!ref.current) throw new Error('gamemode HUD mounted without all owned elements');
    return ref.current;
}

export function GamemodeHud() {
    const root = useRef<HTMLElement>(null);
    const modeName = useRef<HTMLParagraphElement>(null);
    const checkpoint = useRef<HTMLElement>(null);
    const checkpointTotal = useRef<HTMLElement>(null);
    const lap = useRef<HTMLElement>(null);
    const lapTotal = useRef<HTMLElement>(null);
    const score = useRef<HTMLElement>(null);
    const time = useRef<HTMLElement>(null);
    const announcement = useRef<HTMLParagraphElement>(null);

    useEffect(() => bindGamemodeHud({
        root: required(root),
        modeName: required(modeName),
        checkpoint: required(checkpoint),
        checkpointTotal: required(checkpointTotal),
        lap: required(lap),
        lapTotal: required(lapTotal),
        score: required(score),
        time: required(time),
        announcement: required(announcement),
    }), []);

    return (
        <section ref={root} id="gamemode-hud" className="gamemode-hud" aria-label="Solo run status" hidden>
            <div className="run-hud-progress">
                <p ref={modeName} className="run-hud-mode">Solo run</p>
                <p className="run-hud-goal">
                    Gate <strong ref={checkpoint}>1</strong><span aria-hidden="true">/</span><span ref={checkpointTotal}>4</span>
                    <span className="run-hud-divider" aria-hidden="true" />
                    Lap <strong ref={lap}>1</strong><span aria-hidden="true">/</span><span ref={lapTotal}>2</span>
                </p>
            </div>
            <dl className="run-hud-stats">
                <div><dt>Time</dt><dd ref={time}>0.00s</dd></div>
                <div><dt>Score</dt><dd ref={score}>0</dd></div>
            </dl>
            <button id="gamemode-end-run" className="lp-button run-hud-end" type="button" onClick={endGamemode}>
                End run
            </button>
            <p ref={announcement} className="lp-visually-hidden" role="status" aria-live="polite" aria-atomic="true" />
        </section>
    );
}

function Leaderboard({ leaderboard }: { leaderboard: LeaderboardView }) {
    if (leaderboard.status === 'practice') {
        return <p className="run-results-note">Practice result · not submitted to the board</p>;
    }
    if (leaderboard.status === 'loading') {
        return (
            <div className="run-board run-board-loading" aria-busy="true" aria-label="Loading practice board">
                <span /><span /><span />
            </div>
        );
    }
    if (leaderboard.status === 'empty') {
        return (
            <div className="run-board-empty">
                <strong>First tracks on the moon</strong>
                <span>No practice finishes are listed yet. Start another run and set the pace.</span>
            </div>
        );
    }
    if (leaderboard.status === 'error') {
        return (
            <div className="run-board-error" role="alert">
                <span>Couldn’t load the practice board. Your result is safe.</span>
                <button className="lp-button" type="button" onClick={retryLeaderboard}>Try again</button>
            </div>
        );
    }
    return (
        <div className="run-board">
            <p>Unverified practice times · no rewards or ranked authority</p>
            <ol>
                {leaderboard.entries.slice(0, 5).map((entry, index) => (
                    <li key={`${entry.playerId}-${entry.bestTimeMs}-${index}`}>
                        <span>{entry.playerId}</span>
                        <strong>{formatRunTime(entry.bestTimeMs)}</strong>
                    </li>
                ))}
            </ol>
        </div>
    );
}

function personalBestLabel(result: GamemodeResultView): string {
    if (result.reason !== 'finish') return 'Finish the circuit to set a best';
    if (result.personalBest.isNew && result.personalBest.previousScore === null) return 'First finish · personal best set';
    if (result.personalBest.isNew) return `New best · +${(result.score - (result.personalBest.previousScore ?? 0)).toLocaleString()}`;
    return `${((result.personalBest.previousScore ?? result.score) - result.score).toLocaleString()} points from your best`;
}

function trapResultFocus(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
        event.preventDefault();
        dismissGamemodeResults();
        return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...event.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE)]
        .filter(element => element.getClientRects().length > 0);
    if (focusable.length === 0) return;
    const first = focusable[0]!;
    const last = focusable.at(-1)!;
    if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
    }
}

export function GamemodeResults({ result }: { result: GamemodeResultView }) {
    const primary = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        pauseController.setPaused(true);
        primary.current?.focus({ preventScroll: true });
        return () => {
            pauseController.setPaused(false);
            window.requestAnimationFrame(() => document.getElementById('menu-button')?.focus({ preventScroll: true }));
        };
    }, [result.modeId]);

    return (
        <div
            id="gamemode-results"
            className="lp-overlay experience-overlay run-results-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="run-results-title"
            onKeyDown={trapResultFocus}
        >
            <button className="lp-scrim experience-backdrop" type="button" tabIndex={-1} aria-label="Keep skating" onClick={dismissGamemodeResults} />
            <section className="run-results-card">
                <header className="run-results-head">
                    <p>{result.reason === 'finish' ? 'Run complete' : 'Practice run'}</p>
                    <h2 id="run-results-title">{result.modeName}</h2>
                    <span>{result.reason === 'finish' ? `Finished in ${formatRunTime(result.elapsedMs)}` : `Run ended at ${formatRunTime(result.elapsedMs)}`}</span>
                </header>

                <div className="run-results-score">
                    <span>Score</span>
                    <strong>{result.score.toLocaleString()}</strong>
                    <small>{personalBestLabel(result)}</small>
                </div>

                <dl className="run-score-breakdown" aria-label="Score breakdown">
                    <div><dt>Gates</dt><dd>+{result.breakdown.checkpointScore.toLocaleString()}</dd></div>
                    <div><dt>Laps</dt><dd>+{result.breakdown.lapScore.toLocaleString()}</dd></div>
                    {result.breakdown.completionBonus > 0 && <div><dt>Finish</dt><dd>+{result.breakdown.completionBonus.toLocaleString()}</dd></div>}
                    <div><dt>Time</dt><dd>−{result.breakdown.timePenalty.toLocaleString()}</dd></div>
                    {result.breakdown.fallPenalty > 0 && <div><dt>Falls</dt><dd>−{result.breakdown.fallPenalty.toLocaleString()}</dd></div>}
                </dl>

                <Leaderboard leaderboard={result.leaderboard} />

                <div className="run-results-actions">
                    <button ref={primary} id="gamemode-play-again" className="lp-button lp-button-primary" type="button" onClick={retryGamemode}>
                        Play again
                    </button>
                    <button id="gamemode-keep-skating" className="lp-button" type="button" onClick={dismissGamemodeResults}>
                        Keep skating
                    </button>
                </div>
                <p className="run-results-hint"><span className="key">Esc</span> keep skating</p>
            </section>
        </div>
    );
}
