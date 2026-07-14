import { useSyncExternalStore } from "react";
import { GlassSelect } from "./GlassSelect";
import type { MultiplayerStatus } from "./multiplayer";
import {
  formatPerfTierName,
  getPerfOverride,
  getPerfOverrideLabel,
  type PerfOverride,
  type PerfTierId,
  setPerfOverride,
  subscribePerf,
} from "./performanceTiers";

export type MenuScreen = "main" | "options" | "credits" | "controls";

type StartMenuProps = {
  screen: MenuScreen;
  onScreen: (screen: MenuScreen) => void;
  draftRoom: string;
  onDraftRoom: (v: string) => void;
  onPlay: () => void;
};

type PauseMenuProps = {
  screen: MenuScreen;
  onScreen: (screen: MenuScreen) => void;
  draftRoom: string;
  onDraftRoom: (v: string) => void;
  onResume: () => void;
  onQuit: () => void;
  onApplyRoom: () => void;
  roomId: string;
  peerCount: number;
  selfId: string;
  status: MultiplayerStatus;
  statusDetail: string;
};

const PERF_OVERRIDE_OPTIONS: readonly {
  value: string;
  override: PerfOverride;
}[] = [
  { value: "auto", override: "auto" },
  { value: "0", override: 0 },
  { value: "1", override: 1 },
  { value: "2", override: 2 },
  { value: "3", override: 3 },
];

function overrideToValue(o: PerfOverride): string {
  return o === "auto" ? "auto" : String(o);
}

function valueToOverride(v: string): PerfOverride {
  if (v === "auto") return "auto";
  return Number(v) as PerfTierId;
}

function labelForOverrideValue(v: string): string {
  const o = valueToOverride(v);
  if (o === "auto") return getPerfOverrideLabel();
  return formatPerfTierName(o);
}

function PerformanceTierField() {
  const override = useSyncExternalStore(
    subscribePerf,
    getPerfOverride,
    getPerfOverride,
  );
  // Re-render when the adaptive tier changes so Auto (X) stays live.
  useSyncExternalStore(
    subscribePerf,
    getPerfOverrideLabel,
    getPerfOverrideLabel,
  );

  return (
    <GlassSelect
      id="menu-perf"
      label="Performance"
      value={overrideToValue(override)}
      options={PERF_OVERRIDE_OPTIONS.map((o) => ({ value: o.value }))}
      labelFor={labelForOverrideValue}
      onChange={(v) => setPerfOverride(valueToOverride(v))}
    />
  );
}

function OptionsFields({
  draftRoom,
  onDraftRoom,
  onSubmit,
  submitLabel,
}: {
  draftRoom: string;
  onDraftRoom: (v: string) => void;
  onSubmit?: () => void;
  submitLabel?: string;
}) {
  return (
    <div className="menu__options">
      <label htmlFor="menu-room">Room</label>
      <div className="menu__row">
        <input
          id="menu-room"
          value={draftRoom}
          onChange={(e) => onDraftRoom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && onSubmit) onSubmit();
          }}
          spellCheck={false}
        />
        {onSubmit && submitLabel ? (
          <button type="button" onClick={onSubmit}>
            {submitLabel}
          </button>
        ) : null}
      </div>
      <p className="menu__hint">
        Share the same room name to skate with friends.
      </p>

      <PerformanceTierField />
      <p className="menu__hint">
        Auto starts low and climbs with your machine. Pick a tier to lock
        quality.
      </p>
    </div>
  );
}

function ControlsBody() {
  return (
    <div className="menu__credits">
      <p className="menu__controls">
        <kbd>W</kbd> forward · <kbd>S</kbd> reverse · <kbd>A</kbd>/<kbd>D</kbd>{" "}
        turn · <kbd>F</kbd> nose up · <kbd>R</kbd> nose down · <kbd>Q</kbd>/
        <kbd>E</kbd> roll · <kbd>Shift</kbd> boost · <kbd>Esc</kbd> pause
      </p>
      <p className="menu__controls">
        Drag to orbit · scroll to zoom · FOV opens up at speed
      </p>
      <p>
        Hold W to thrust. Shift for a boost. R/F pitches and Q/E rolls the board
        in the air. Pause to watch your best ghost line.
      </p>
    </div>
  );
}

function CreditsBody() {
  return (
    <div className="menu__credits">
      <p>
        Made with the{" "}
        <a
          href="https://discord.gg/nousresearch"
          target="_blank"
          rel="noreferrer"
        >
          Nous Research Discord community
        </a>{" "}
        (not official).
      </p>
    </div>
  );
}

function BackButton({ onScreen }: { onScreen: (s: MenuScreen) => void }) {
  return (
    <button
      type="button"
      className="menu__btn menu__btn--ghost"
      onClick={() => onScreen("main")}
    >
      Back
    </button>
  );
}

function MainNav({
  onPlay,
  onScreen,
  playLabel = "Play",
  showQuit,
  onQuit,
}: {
  onPlay: () => void;
  onScreen: (s: MenuScreen) => void;
  playLabel?: string;
  showQuit?: boolean;
  onQuit?: () => void;
}) {
  return (
    <nav className="menu__nav">
      <button type="button" className="menu__btn" onClick={onPlay}>
        {playLabel}
      </button>
      <button
        type="button"
        className="menu__btn menu__btn--ghost"
        onClick={() => onScreen("options")}
      >
        Options
      </button>
      <button
        type="button"
        className="menu__btn menu__btn--ghost"
        onClick={() => onScreen("controls")}
      >
        Controls
      </button>
      <button
        type="button"
        className="menu__btn menu__btn--ghost"
        onClick={() => onScreen("credits")}
      >
        Credits
      </button>
      {showQuit && onQuit ? (
        <button
          type="button"
          className="menu__btn menu__btn--ghost"
          onClick={onQuit}
        >
          Quit to menu
        </button>
      ) : null}
    </nav>
  );
}

export function StartMenu({
  screen,
  onScreen,
  draftRoom,
  onDraftRoom,
  onPlay,
}: StartMenuProps) {
  return (
    <div className="menu">
      <div className="menu__card">
        <p className="menu__eyebrow">Moon bowl skate</p>
        <h1 className="menu__title">Lunar Pup</h1>
        <p className="menu__tagline">
          Skate the crater bowls. Low gravity. High vibes.
        </p>

        {screen === "main" ? (
          <MainNav onPlay={onPlay} onScreen={onScreen} />
        ) : null}

        {screen === "options" ? (
          <>
            <OptionsFields draftRoom={draftRoom} onDraftRoom={onDraftRoom} />
            <BackButton onScreen={onScreen} />
          </>
        ) : null}

        {screen === "controls" ? (
          <>
            <ControlsBody />
            <BackButton onScreen={onScreen} />
          </>
        ) : null}

        {screen === "credits" ? (
          <>
            <CreditsBody />
            <BackButton onScreen={onScreen} />
          </>
        ) : null}
      </div>
    </div>
  );
}

export function PauseMenu({
  screen,
  onScreen,
  draftRoom,
  onDraftRoom,
  onResume,
  onQuit,
  onApplyRoom,
  roomId,
  peerCount,
  selfId,
  status,
  statusDetail,
}: PauseMenuProps) {
  return (
    <div className="menu menu--pause">
      <div className="menu__card">
        <p className="menu__eyebrow">Paused</p>
        <h1 className="menu__title">Ghost mode</h1>
        <p className="menu__tagline">
          You&apos;re a ghost until you resume. Other pups can still see you.
        </p>

        {screen === "main" ? (
          <MainNav
            onPlay={onResume}
            onScreen={onScreen}
            playLabel="Resume"
            showQuit
            onQuit={onQuit}
          />
        ) : null}

        {screen === "options" ? (
          <>
            <OptionsFields
              draftRoom={draftRoom}
              onDraftRoom={onDraftRoom}
              onSubmit={onApplyRoom}
              submitLabel="Join"
            />
            <div className="menu__meta">
              <div>
                live room <strong>{roomId}</strong>
              </div>
              <div>
                pups nearby <strong>{peerCount}</strong>
              </div>
              <div>
                net <strong data-status={status}>{status}</strong>
                <span> — {statusDetail}</span>
              </div>
              <div>
                you <strong>{selfId.slice(0, 6)}</strong>
              </div>
            </div>
            <BackButton onScreen={onScreen} />
          </>
        ) : null}

        {screen === "controls" ? (
          <>
            <ControlsBody />
            <BackButton onScreen={onScreen} />
          </>
        ) : null}

        {screen === "credits" ? (
          <>
            <CreditsBody />
            <BackButton onScreen={onScreen} />
          </>
        ) : null}
      </div>
    </div>
  );
}
