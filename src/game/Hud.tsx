import { useSyncExternalStore } from "react";
import { DebugPanel } from "./DebugPanel";
import { getHudSpeed, subscribeHudSpeed } from "./hudSpeed";
import { LunarMap } from "./LunarMap";
import { SpeedLines } from "./SpeedLines";

type HudProps = {
  selfId: string;
};

/** In-play overlay — speed chip + floating hover map (+ optional ?debug panel). */
export function Hud({ selfId }: HudProps) {
  const speed = useSyncExternalStore(
    subscribeHudSpeed,
    getHudSpeed,
    getHudSpeed,
  );

  return (
    <div className="hud">
      <SpeedLines />
      <div className="hud__speed">
        <span>{speed}</span>
        <small>m/s</small>
      </div>
      <DebugPanel />
      <LunarMap selfId={selfId} />
    </div>
  );
}
