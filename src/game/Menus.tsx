import { useSyncExternalStore } from "react";
import { GlassSelect } from "./GlassSelect";
import type { MultiplayerStatus } from "./multiplayer";
import type { PartyMember } from "./party";
import {
  formatPerfTierName,
  getPerfOverride,
  getPerfOverrideLabel,
  getPerfSettings,
  type PerfOverride,
  type PerfTierId,
  setPerfOverride,
  subscribePerf,
} from "./performanceTiers";

export type MenuScreen =
  | "main"
  | "room"
  | "party"
  | "options"
  | "credits"
  | "controls";

type StartMenuProps = {
  screen: MenuScreen;
  onScreen: (screen: MenuScreen) => void;
  draftWorld: string;
  onDraftWorld: (v: string) => void;
  draftParty: string;
  onDraftParty: (v: string) => void;
  draftName: string;
  onDraftName: (v: string) => void;
  onSkate: () => void;
  onJoinWorld: () => void;
  onCreateParty: () => void;
  onJoinParty: () => void;
};

type PauseMenuProps = {
  screen: MenuScreen;
  onScreen: (screen: MenuScreen) => void;
  draftWorld: string;
  onDraftWorld: (v: string) => void;
  draftName: string;
  onDraftName: (v: string) => void;
  onResume: () => void;
  onQuit: () => void;
  onApplyWorld: () => void;
  onCopyInvite: () => void;
  worldId: string;
  partyId: string | null;
  peerCount: number;
  playerName: string;
  status: MultiplayerStatus;
  statusDetail: string;
  members: PartyMember[];
  selfId: string;
  hostId: string | null;
  isHost?: boolean;
};

type LobbyMenuProps = {
  partyId: string;
  draftWorld: string;
  onDraftWorld: (v: string) => void;
  members: PartyMember[];
  selfId: string;
  hostId: string | null;
  isHost: boolean;
  ready: boolean;
  canStart: boolean;
  statusDetail: string;
  onReady: (ready: boolean) => void;
  onStart: () => void;
  onLeave: () => void;
  onCopyInvite: () => void;
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

function PerformanceTierField() {
  const override = useSyncExternalStore(
    subscribePerf,
    getPerfOverride,
    getPerfOverride,
  );
  const settings = useSyncExternalStore(
    subscribePerf,
    getPerfSettings,
    getPerfSettings,
  );

  const options = PERF_OVERRIDE_OPTIONS.map((o) => ({
    value: o.value,
    label:
      o.override === "auto"
        ? `Auto (${formatPerfTierName(settings.name)})`
        : formatPerfTierName(o.override),
  }));

  return (
    <GlassSelect
      id="menu-perf"
      label="Performance"
      value={overrideToValue(override)}
      options={options}
      labelFor={() => getPerfOverrideLabel()}
      onChange={(v) => setPerfOverride(valueToOverride(v))}
    />
  );
}

function NameField({
  draftName,
  onDraftName,
}: {
  draftName: string;
  onDraftName: (v: string) => void;
}) {
  return (
    <>
      <label htmlFor="menu-name">Your name</label>
      <div className="menu__row">
        <input
          id="menu-name"
          value={draftName}
          onChange={(e) => onDraftName(e.target.value)}
          maxLength={16}
          spellCheck={false}
          autoComplete="username"
          placeholder="Pup name"
        />
      </div>
    </>
  );
}

function OptionsFields({
  draftWorld,
  onDraftWorld,
  draftName,
  onDraftName,
  onSubmit,
  submitLabel,
  showWorld = true,
}: {
  draftWorld: string;
  onDraftWorld: (v: string) => void;
  draftName: string;
  onDraftName: (v: string) => void;
  onSubmit?: () => void;
  submitLabel?: string;
  showWorld?: boolean;
}) {
  return (
    <div className="menu__options">
      <NameField draftName={draftName} onDraftName={onDraftName} />

      {showWorld ? (
        <>
          <label htmlFor="menu-room">World</label>
          <div className="menu__row">
            <input
              id="menu-room"
              value={draftWorld}
              onChange={(e) => onDraftWorld(e.target.value)}
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
            A world is a shared crater — like a Minecraft server.
          </p>
        </>
      ) : null}

      <PerformanceTierField />
      <p className="menu__hint">
        Auto starts at High and scales with your machine.
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
        Touch: d-pad for nose & turn · jump / boost above it · stick moves ·
        roll buttons for air attitude
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
  onSkate,
  onScreen,
}: {
  onSkate: () => void;
  onScreen: (s: MenuScreen) => void;
}) {
  return (
    <nav className="menu__nav">
      <button type="button" className="menu__btn" onClick={onSkate}>
        Skate
      </button>
      <p className="menu__hint menu__hint--tight">
        Jump into your last world and ride.
      </p>
      <button
        type="button"
        className="menu__btn menu__btn--ghost"
        onClick={() => onScreen("room")}
      >
        Join a world
      </button>
      <button
        type="button"
        className="menu__btn menu__btn--ghost"
        onClick={() => onScreen("party")}
      >
        Party
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
    </nav>
  );
}

/** Minecraft-style: pick a shared world and skate in it. */
function RoomBody({
  draftName,
  onDraftName,
  draftWorld,
  onDraftWorld,
  onJoinWorld,
}: {
  draftName: string;
  onDraftName: (v: string) => void;
  draftWorld: string;
  onDraftWorld: (v: string) => void;
  onJoinWorld: () => void;
}) {
  return (
    <div className="menu__options">
      <p className="menu__lead">
        Worlds are shared craters — anyone with the same name lands in the same
        place, like joining a Minecraft server.
      </p>
      <NameField draftName={draftName} onDraftName={onDraftName} />
      <label htmlFor="menu-world-name">World name</label>
      <div className="menu__row">
        <input
          id="menu-world-name"
          value={draftWorld}
          onChange={(e) => onDraftWorld(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onJoinWorld();
          }}
          spellCheck={false}
          placeholder="moon-bowl"
        />
        <button type="button" onClick={onJoinWorld}>
          Join
        </button>
      </div>
    </div>
  );
}

/** Fortnite-style: gather friends, ready up, then skate together. */
function PartyBody({
  draftName,
  onDraftName,
  draftParty,
  onDraftParty,
  onCreateParty,
  onJoinParty,
}: {
  draftName: string;
  onDraftName: (v: string) => void;
  draftParty: string;
  onDraftParty: (v: string) => void;
  onCreateParty: () => void;
  onJoinParty: () => void;
}) {
  return (
    <div className="menu__options">
      <p className="menu__lead">
        A party is your crew. Invite friends, ready up, then drop into a world
        together — like a Fortnite party.
      </p>
      <NameField draftName={draftName} onDraftName={onDraftName} />
      <button type="button" className="menu__btn" onClick={onCreateParty}>
        Start a party
      </button>
      <div className="menu__divider" aria-hidden>
        <span>or join a friend</span>
      </div>
      <label htmlFor="menu-party-code">Invite code</label>
      <div className="menu__row">
        <input
          id="menu-party-code"
          value={draftParty}
          onChange={(e) => onDraftParty(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onJoinParty();
          }}
          spellCheck={false}
          placeholder="pup-xxxxxx"
        />
        <button type="button" onClick={onJoinParty}>
          Join
        </button>
      </div>
    </div>
  );
}

export function StartMenu({
  screen,
  onScreen,
  draftWorld,
  onDraftWorld,
  draftParty,
  onDraftParty,
  draftName,
  onDraftName,
  onSkate,
  onJoinWorld,
  onCreateParty,
  onJoinParty,
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
          <MainNav onSkate={onSkate} onScreen={onScreen} />
        ) : null}

        {screen === "room" ? (
          <>
            <RoomBody
              draftName={draftName}
              onDraftName={onDraftName}
              draftWorld={draftWorld}
              onDraftWorld={onDraftWorld}
              onJoinWorld={onJoinWorld}
            />
            <BackButton onScreen={onScreen} />
          </>
        ) : null}

        {screen === "party" ? (
          <>
            <PartyBody
              draftName={draftName}
              onDraftName={onDraftName}
              draftParty={draftParty}
              onDraftParty={onDraftParty}
              onCreateParty={onCreateParty}
              onJoinParty={onJoinParty}
            />
            <BackButton onScreen={onScreen} />
          </>
        ) : null}

        {screen === "options" ? (
          <>
            <OptionsFields
              draftWorld={draftWorld}
              onDraftWorld={onDraftWorld}
              draftName={draftName}
              onDraftName={onDraftName}
              showWorld={false}
            />
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

export function LobbyMenu({
  partyId,
  draftWorld,
  onDraftWorld,
  members,
  selfId,
  hostId,
  isHost,
  ready,
  canStart,
  statusDetail,
  onReady,
  onStart,
  onLeave,
  onCopyInvite,
}: LobbyMenuProps) {
  const waiting = members.filter((m) => !m.ready).length;

  return (
    <div className="menu">
      <div className="menu__card">
        <p className="menu__eyebrow">{isHost ? "You're hosting" : "Party"}</p>
        <h1 className="menu__title">Lobby</h1>
        <p className="menu__tagline">
          <span className="menu__code">{partyId}</span>
          <button type="button" className="menu__link" onClick={onCopyInvite}>
            Copy invite
          </button>
        </p>

        <ul className="menu__roster" aria-label="Party roster">
          {members.map((m) => (
            <li key={m.id} className="menu__roster-item">
              <span className="menu__roster-name">
                {m.name}
                {m.id === selfId ? " · you" : ""}
                {m.id === hostId ? " · host" : ""}
              </span>
              <span
                className={
                  m.ready ? "menu__roster-ready is-ready" : "menu__roster-ready"
                }
              >
                {m.ready ? "ready" : "…"}
              </span>
            </li>
          ))}
        </ul>

        {isHost ? (
          <>
            <label htmlFor="lobby-world">World to drop into</label>
            <div className="menu__row">
              <input
                id="lobby-world"
                value={draftWorld}
                onChange={(e) => onDraftWorld(e.target.value)}
                spellCheck={false}
                placeholder="moon-bowl"
              />
            </div>
          </>
        ) : (
          <p className="menu__hint menu__hint--tight">
            Host picks the world when everyone is ready.
          </p>
        )}

        <p className="menu__hint menu__hint--tight">
          {statusDetail}
          {waiting > 0
            ? ` · ${waiting} still getting ready`
            : members.length > 1
              ? " · everyone's ready"
              : ""}
        </p>

        <nav className="menu__nav">
          {isHost && canStart ? (
            <button type="button" className="menu__btn" onClick={onStart}>
              Start skating
            </button>
          ) : (
            <button
              type="button"
              className="menu__btn"
              onClick={() => onReady(!ready)}
            >
              {ready ? "Not ready" : "I'm ready"}
            </button>
          )}
          {isHost && canStart ? (
            <button
              type="button"
              className="menu__btn menu__btn--ghost"
              onClick={() => onReady(false)}
            >
              Not ready
            </button>
          ) : null}
          {!isHost && ready ? (
            <p className="menu__hint menu__hint--tight">
              Waiting for the host to start…
            </p>
          ) : null}
          <button
            type="button"
            className="menu__btn menu__btn--ghost"
            onClick={onLeave}
          >
            Leave party
          </button>
        </nav>
      </div>
    </div>
  );
}

export function PauseMenu({
  screen,
  onScreen,
  draftWorld,
  onDraftWorld,
  draftName,
  onDraftName,
  onResume,
  onQuit,
  onApplyWorld,
  onCopyInvite,
  worldId,
  partyId,
  peerCount,
  playerName,
  status,
  statusDetail,
  members,
  selfId,
  hostId,
  isHost,
}: PauseMenuProps) {
  const inParty = partyId !== null;

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
            {inParty ? (
              <button
                type="button"
                className="menu__btn menu__btn--ghost"
                onClick={() => onScreen("party")}
              >
                Party
              </button>
            ) : null}
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
              onClick={onQuit}
            >
              {inParty ? "Back to lobby" : "Quit to menu"}
            </button>
          </nav>
        ) : null}

        {screen === "party" && inParty ? (
          <>
            <div className="menu__options">
              <p className="menu__lead">
                Your crew. Share the invite so friends can join the party.
              </p>
              <p className="menu__tagline">
                <span className="menu__code">{partyId}</span>
                <button
                  type="button"
                  className="menu__link"
                  onClick={onCopyInvite}
                >
                  Copy invite
                </button>
              </p>
              <ul className="menu__roster" aria-label="Party roster">
                {members.length === 0 ? (
                  <li className="menu__roster-item">
                    <span className="menu__roster-name">Just you so far</span>
                  </li>
                ) : (
                  members.map((m) => (
                    <li key={m.id} className="menu__roster-item">
                      <span className="menu__roster-name">
                        {m.name}
                        {m.id === selfId ? " · you" : ""}
                        {m.id === hostId ? " · host" : ""}
                      </span>
                    </li>
                  ))
                )}
              </ul>
              <div className="menu__meta">
                <div>
                  world <strong>{worldId}</strong>
                </div>
                <div>
                  pups nearby <strong>{peerCount}</strong>
                </div>
                <div>
                  net <strong data-status={status}>{status}</strong>
                  <span> — {statusDetail}</span>
                </div>
                {isHost ? (
                  <div>
                    you are <strong>host</strong>
                  </div>
                ) : null}
              </div>
            </div>
            <BackButton onScreen={onScreen} />
          </>
        ) : null}

        {screen === "options" ? (
          <>
            <OptionsFields
              draftWorld={draftWorld}
              onDraftWorld={onDraftWorld}
              draftName={draftName}
              onDraftName={onDraftName}
              onSubmit={onApplyWorld}
              submitLabel="Switch"
            />
            <div className="menu__meta">
              <div>
                world <strong>{worldId}</strong>
              </div>
              <div>
                nearby <strong>{peerCount}</strong>
              </div>
              <div>
                net <strong data-status={status}>{status}</strong>
                <span> — {statusDetail}</span>
              </div>
              <div>
                you <strong>{playerName}</strong>
                {isHost ? <span> · host</span> : null}
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
      </div>
    </div>
  );
}
