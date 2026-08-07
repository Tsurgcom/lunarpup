import { useSyncExternalStore } from "react";
import { DebugPanel } from "./DebugPanel";
import { getHudBoosting, getHudSpeed, subscribeHudSpeed } from "./hudSpeed";
import { LunarMap } from "./LunarMap";
import { SpeedLines } from "./SpeedLines";
import { TouchControls } from "./TouchControls";
import { TweakingPanel } from "./TweakingPanel";
import {
  getTouchUiMobileLayout,
  getTouchUiVisible,
  subscribeTouchUiVisible,
} from "./touchUiVisibility";

type HudProps = {
  selfId: string;
  onPause: () => void;
};

/** In-play overlay — speed chip + floating hover map (+ optional ?debug / ?tweaking). */
export function Hud({ selfId, onPause }: HudProps) {
  const speed = useSyncExternalStore(
    subscribeHudSpeed,
    getHudSpeed,
    getHudSpeed,
  );
  const boosting = useSyncExternalStore(
    subscribeHudSpeed,
    getHudBoosting,
    getHudBoosting,
  );
  const touch = useSyncExternalStore(
    subscribeTouchUiVisible,
    getTouchUiVisible,
    () => false,
  );
  const mobileTouch = useSyncExternalStore(
    subscribeTouchUiVisible,
    getTouchUiMobileLayout,
    () => false,
  );

  const hudClass = [
    "hud",
    touch ? "hud--touch" : "",
    mobileTouch ? "hud--mobile-touch" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={hudClass}>
      <SpeedLines />
      {touch ? (
        <button
          type="button"
          className="hud__pause"
          aria-label="Pause"
          onClick={onPause}
        >
          <span className="hud__pause-icon" aria-hidden>
            ❚❚
          </span>
          <span className="hud__pause-label">MENU</span>
        </button>
      ) : null}
      <div className={`hud__speed${boosting ? " hud__speed--boost" : ""}`}>
        <small className="hud__speed-label">VEL</small>
        <span>{String(speed).padStart(4, "0")}</span>
        <small>U/S</small>
        {boosting ? <em className="hud__boost">BOOST</em> : null}
      </div>
      <DebugPanel />
      <TweakingPanel />
      <LunarMap selfId={selfId} compactIcon={mobileTouch} />
      <TouchControls />
    </div>
  );
}
