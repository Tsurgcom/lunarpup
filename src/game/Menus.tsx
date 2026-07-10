import type { MultiplayerStatus } from "./multiplayer";

export type MenuScreen = "main" | "options" | "credits";

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
  status: MultiplayerStatus;
  statusDetail: string;
};

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
          <nav className="menu__nav">
            <button type="button" className="menu__btn" onClick={onPlay}>
              Play
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
              onClick={() => onScreen("credits")}
            >
              Credits
            </button>
          </nav>
        ) : null}

        {screen === "options" ? (
          <>
            <OptionsFields draftRoom={draftRoom} onDraftRoom={onDraftRoom} />
            <button
              type="button"
              className="menu__btn menu__btn--ghost"
              onClick={() => onScreen("main")}
            >
              Back
            </button>
          </>
        ) : null}

        {screen === "credits" ? (
          <>
            <CreditsBody />
            <button
              type="button"
              className="menu__btn menu__btn--ghost"
              onClick={() => onScreen("main")}
            >
              Back
            </button>
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
          <nav className="menu__nav">
            <button type="button" className="menu__btn" onClick={onResume}>
              Resume
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
              onClick={() => onScreen("credits")}
            >
              Credits
            </button>
            <button
              type="button"
              className="menu__btn menu__btn--ghost"
              onClick={onQuit}
            >
              Quit to menu
            </button>
          </nav>
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
            </div>
            <button
              type="button"
              className="menu__btn menu__btn--ghost"
              onClick={() => onScreen("main")}
            >
              Back
            </button>
          </>
        ) : null}

        {screen === "credits" ? (
          <>
            <CreditsBody />
            <button
              type="button"
              className="menu__btn menu__btn--ghost"
              onClick={() => onScreen("main")}
            >
              Back
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
