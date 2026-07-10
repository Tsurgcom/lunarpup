import { Canvas } from "@react-three/fiber";
import { KeyboardControls } from "@react-three/drei";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Hud } from "./game/Hud";
import { PauseMenu, StartMenu, type MenuScreen } from "./game/Menus";
import { useMultiplayer } from "./game/multiplayer";
import { defaultRoomId } from "./game/types";
import type { PlayerSnapshot } from "./game/types";
import { World } from "./game/World";

const keyMap = [
  { name: "forward", keys: ["ArrowUp", "KeyW"] },
  { name: "back", keys: ["ArrowDown", "KeyS"] },
  { name: "left", keys: ["ArrowLeft", "KeyA"] },
  { name: "right", keys: ["ArrowRight", "KeyD"] },
  { name: "jump", keys: ["Space"] },
  { name: "brake", keys: ["ShiftLeft", "ShiftRight"] },
];

type Phase = "menu" | "playing" | "paused";

export function App() {
  const initial = useMemo(() => defaultRoomId(), []);
  const [roomId, setRoomId] = useState(initial);
  const [draftRoom, setDraftRoom] = useState(initial);
  const [speed, setSpeed] = useState(0);
  const [phase, setPhase] = useState<Phase>("menu");
  const [menuScreen, setMenuScreen] = useState<MenuScreen>("main");

  const online = phase !== "menu";
  const { peerCount, selfId, status, statusDetail, sendState, style } =
    useMultiplayer(roomId, online);

  const onSnapshot = useCallback(
    (snap: PlayerSnapshot) => {
      sendState(snap);
    },
    [sendState],
  );

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
    setSpeed(0);
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
          status={status}
          statusDetail={statusDetail}
        />
      ) : null}

      {phase === "playing" ? (
        <Hud
          roomId={roomId}
          peerCount={peerCount}
          selfId={selfId}
          speed={speed}
          status={status}
          statusDetail={statusDetail}
        />
      ) : null}

      <KeyboardControls map={keyMap}>
        <Canvas
          shadows
          dpr={[1, 1.75]}
          camera={{ position: [0, 8, 22], fov: 68, near: 0.1, far: 320 }}
          gl={{ antialias: true, toneMappingExposure: 1.05 }}
        >
          <World
            fur={style.fur}
            accent={style.accent}
            name={selfId.slice(0, 6)}
            active={online}
            paused={phase === "paused"}
            onSnapshot={onSnapshot}
            onSpeed={setSpeed}
          />
        </Canvas>
      </KeyboardControls>
    </>
  );
}
