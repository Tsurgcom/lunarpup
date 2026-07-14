import { KeyboardControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { resetGhostSession } from "./game/ghostLine";
import { Hud } from "./game/Hud";
import { setHudSpeed } from "./game/hudSpeed";
import { type MenuScreen, PauseMenu, StartMenu } from "./game/Menus";
import { MOON_RADIUS, SPAWN_ALTITUDE, SPAWN_DIR } from "./game/moon";
import { useMultiplayer } from "./game/multiplayer";
import {
  getPerfSettings,
  resetPerformanceTier,
  subscribePerf,
} from "./game/performanceTiers";
import { defaultRoomId } from "./game/types";
import { World } from "./game/World";

/** Near spawn, outside the decorative moon. */
const SPAWN_CAM_R = MOON_RADIUS + SPAWN_ALTITUDE + 8;
const SPAWN_CAM: [number, number, number] = [
  SPAWN_DIR.x * SPAWN_CAM_R,
  SPAWN_DIR.y * SPAWN_CAM_R,
  SPAWN_DIR.z * SPAWN_CAM_R,
];

/** Stable identity — a fresh object each App render can recreate R3F's camera. */
const CANVAS_CAMERA = {
  position: SPAWN_CAM,
  fov: 55,
  near: 0.15,
  far: 8000,
} as const;

const keyMap = [
  { name: "forward", keys: ["ArrowUp", "KeyW"] },
  { name: "back", keys: ["ArrowDown", "KeyS"] },
  { name: "left", keys: ["ArrowLeft", "KeyA"] },
  { name: "right", keys: ["ArrowRight", "KeyD"] },
  { name: "pitchUp", keys: ["KeyF"] },
  { name: "pitchDown", keys: ["KeyR"] },
  { name: "rollLeft", keys: ["KeyQ"] },
  { name: "rollRight", keys: ["KeyE"] },
  { name: "jump", keys: ["Space"] },
  { name: "boost", keys: ["ShiftLeft", "ShiftRight"] },
];

type Phase = "menu" | "playing" | "paused";

export function App() {
  const initial = useMemo(() => defaultRoomId(), []);
  const [roomId, setRoomId] = useState(initial);
  const [draftRoom, setDraftRoom] = useState(initial);
  const [phase, setPhase] = useState<Phase>("menu");
  const [menuScreen, setMenuScreen] = useState<MenuScreen>("main");
  const perf = useSyncExternalStore(
    subscribePerf,
    getPerfSettings,
    getPerfSettings,
  );

  const online = phase !== "menu";
  const { peerCount, selfId, status, statusDetail, sendState, style } =
    useMultiplayer(roomId, online);

  // Boot at the cheapest tier before the Canvas mounts.
  useEffect(() => {
    resetPerformanceTier();
  }, []);

  const applyRoom = useCallback(() => {
    const next = draftRoom.trim() || "moon-bowl";
    setRoomId(next);
    setDraftRoom(next);
    const url = new URL(window.location.href);
    url.searchParams.set("room", next);
    window.history.replaceState({}, "", url);
  }, [draftRoom]);

  const onPlay = () => {
    applyRoom();
    setMenuScreen("main");
    setPhase("playing");
  };

  const onResume = () => {
    setMenuScreen("main");
    setPhase("playing");
  };

  const onQuit = () => {
    setMenuScreen("main");
    setPhase("menu");
    setHudSpeed(0);
    resetGhostSession();
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Escape") return;
      if (e.repeat) return;
      // Don't steal Esc from text fields
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      if (phase === "playing") {
        setMenuScreen("main");
        setPhase("paused");
      } else if (phase === "paused") {
        if (menuScreen !== "main") {
          setMenuScreen("main");
        } else {
          setPhase("playing");
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [phase, menuScreen]);

  return (
    <>
      {phase === "menu" ? (
        <StartMenu
          screen={menuScreen}
          onScreen={setMenuScreen}
          draftRoom={draftRoom}
          onDraftRoom={setDraftRoom}
          onPlay={onPlay}
        />
      ) : null}

      {phase === "paused" ? (
        <PauseMenu
          screen={menuScreen}
          onScreen={setMenuScreen}
          draftRoom={draftRoom}
          onDraftRoom={setDraftRoom}
          onResume={onResume}
          onQuit={onQuit}
          onApplyRoom={applyRoom}
          roomId={roomId}
          peerCount={peerCount}
          selfId={selfId}
          status={status}
          statusDetail={statusDetail}
        />
      ) : null}

      {phase === "playing" ? <Hud selfId={selfId} /> : null}

      <KeyboardControls map={keyMap}>
        <Canvas
          shadows={perf.shadows ? "percentage" : false}
          dpr={[1, perf.dpr]}
          camera={CANVAS_CAMERA}
          gl={{
            antialias: false,
            toneMappingExposure: 1.05,
            powerPreference: "high-performance",
          }}
        >
          <World
            fur={style.fur}
            accent={style.accent}
            name={selfId.slice(0, 6)}
            active={online}
            paused={phase === "paused"}
            onSnapshot={sendState}
          />
        </Canvas>
      </KeyboardControls>
    </>
  );
}
