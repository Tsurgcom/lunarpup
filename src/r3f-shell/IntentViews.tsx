import type { ReactNode } from 'react';
import { MultiplayerPanel } from './MultiplayerPanel.tsx';
import { TuningPanel } from './TuningPanel.tsx';

/**
 * The intent layer: four focused overlay views (Shop / Rooms / Settings /
 * Controls). Each is a hidden `.lp-overlay` that the imperative
 * `viewController` (wired in `gameSystems.ts`) reveals one at a time — the
 * world dims behind, Esc returns to play. Only one may be visible at once.
 *
 * These components render the static shell and skeletons; visibility, focus,
 * and Esc are owned imperatively so the R3F render graph never re-renders on a
 * summon. Every view carries main-menu-grade chrome: an eyebrow, a
 * display-weight header, and one primary action — no nested boxes, no emoji.
 */

interface ViewShellProps {
    id: string;
    label: string;
    eyebrow: string;
    title: string;
    children: ReactNode;
}

function ViewShell({ id, label, eyebrow, title, children }: ViewShellProps) {
    return (
        <div id={id} className="lp-overlay lp-view" role="dialog" aria-modal="true" aria-label={label} hidden>
            <div className="lp-scrim" />
            <div className="lp-view-content">
                <header className="lp-view-head">
                    <p className="lp-view-eyebrow">{eyebrow}</p>
                    <h2 className="lp-view-title">{title}</h2>
                </header>
                <div className="lp-view-body">{children}</div>
                <p className="lp-view-hint"><span className="key">Esc</span> return to skating</p>
            </div>
        </div>
    );
}

export function IntentViews() {
    return (
        <>
            <ViewShell id="shop-view" label="Shop" eyebrow="Loadout" title="Shop">
                {/* Cosmetics catalog + crate reveal mount here imperatively. */}
                <div id="shop-view-body" />
            </ViewShell>

            <ViewShell id="rooms-view" label="Rooms" eyebrow="Multiplayer" title="Rooms">
                <MultiplayerPanel />
                {/* Solo + multiplayer gamemode buttons mount here imperatively. */}
                <section id="modes-section" className="lp-view-section" aria-label="Gamemodes" />
            </ViewShell>

            <ViewShell id="settings-view" label="Settings" eyebrow="Tune" title="Settings">
                <TuningPanel />
                <button id="open-controls" className="lp-button" type="button">View controls</button>
            </ViewShell>

            <ViewShell id="controls-view" label="Controls" eyebrow="How to skate" title="Controls">
                <dl className="controls-legend">
                    <div><dt><span className="key">▲</span> / <span className="key">W</span></dt><dd>Accelerate</dd></div>
                    <div><dt><span className="key">▼</span> / <span className="key">S</span></dt><dd>Brake / reverse</dd></div>
                    <div><dt><span className="key">◀</span> <span className="key">▶</span> / <span className="key">A</span> <span className="key">D</span></dt><dd>Steer</dd></div>
                    <div><dt><span className="key">Space</span></dt><dd>Low-gravity ollie</dd></div>
                    <div><dt><span className="key">Shift</span></dt><dd>Boost</dd></div>
                    <div><dt><span className="key">Mouse drag</span></dt><dd>Orbit camera</dd></div>
                    <div><dt><span className="key">Wheel</span></dt><dd>Zoom</dd></div>
                    <div><dt><span className="key">Hold M</span></dt><dd>Enlarge map</dd></div>
                    <div><dt><span className="key">Hold Tab</span></dt><dd>Player roster</dd></div>
                    <div><dt><span className="key">C</span> <span className="key">R</span> <span className="key">T</span> <span className="key">?</span></dt><dd>Shop · Rooms · Settings · Controls</dd></div>
                </dl>
                <button id="controls-dismiss" className="lp-button lp-button-primary" type="button">Got it</button>
            </ViewShell>
        </>
    );
}
