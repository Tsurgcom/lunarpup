import { useSyncExternalStore } from "react";
import { DebugPanel } from "./DebugPanel";
import { getHudBoosting, getHudSpeed, subscribeHudSpeed } from "./hudSpeed";
import { LunarMap } from "./LunarMap";
import { SpeedLines } from "./SpeedLines";
import { TweakingPanel } from "./TweakingPanel";

type HudProps = {
  selfId: string;
};

/** In-play overlay — speed chip + floating hover map (+ optional ?debug / ?tweaking). */
export function Hud({ selfId }: HudProps) {
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

  return (
    <div className="hud">
      <SpeedLines />
      <div className={`hud__speed${boosting ? " hud__speed--boost" : ""}`}>
        <small className="hud__speed-label">VEL</small>
        <span>{String(speed).padStart(4, "0")}</span>
        <small>U/S</small>
        {boosting ? <em className="hud__boost">BOOST</em> : null}
      </div>
      <DebugPanel />
      <TweakingPanel />
      <LunarMap selfId={selfId} />
    </div>
  );
}
