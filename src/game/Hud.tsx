import type { MultiplayerStatus } from "./multiplayer";
import { LunarMap } from "./LunarMap";

type HudProps = {
  roomId: string;
  peerCount: number;
  selfId: string;
  speed: number;
  status: MultiplayerStatus;
  statusDetail: string;
};

export function Hud({
  roomId,
  peerCount,
  selfId,
  speed,
  status,
  statusDetail,
}: HudProps) {
  return (
    <div className="hud">
      <div className="hud__brand">
        <h1>Lunar Pup</h1>
        <p>Skate the crater bowls. Low gravity. High vibes.</p>
      </div>

      <div className="hud__rail">
        <div className="hud__panel">
          <div className="hud__meta">
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
        </div>

        <LunarMap selfId={selfId} />
      </div>

      <div className="hud__speed">
        <span>{speed.toFixed(0)}</span>
        <small>m/s</small>
      </div>

      <div className="hud__help">
        <kbd>W</kbd> push · <kbd>S</kbd> brake · <kbd>A</kbd>/<kbd>D</kbd> turn
        · <kbd>R</kbd>/<kbd>F</kbd> pitch · <kbd>Space</kbd> ollie ·{" "}
        <kbd>Shift</kbd> jetpack · <kbd>Esc</kbd> pause
        <br />
        Wheels need the ground. Hold Shift — W/S fire fore/aft thrusters.
      </div>
    </div>
  );
}
