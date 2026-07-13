import { Canvas } from "@react-three/fiber";
import { KeyboardControls } from "@react-three/drei";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Hud } from "./game/Hud";
import { PauseMenu, StartMenu, type MenuScreen } from "./game/Menus";
import { resetGhostSession } from "./game/ghostLine";
import { setHudSpeed } from "./game/hudSpeed";
import { useMultiplayer } from "./game/multiplayer";
import { defaultRoomId } from "./game/types";
import { World } from "./game/World";

const keyMap = [
  { name: "forward", keys: ["ArrowUp", "KeyW"] },
  { name: "back", keys: ["ArrowDown", "KeyS"] },
  { name: "left", keys: ["ArrowLeft", "KeyA"] },
  { name: "right", keys: ["ArrowRight", "KeyD"] },
  { name: "pitchUp", keys: ["KeyF"] },
  { name: "pitchDown", keys: ["KeyR"] },
  { name: "jump", keys: ["Space"] },
  { name: "jetpack", keys: ["ShiftLeft", "ShiftRight"] },
];

type Phase = "menu" | "playing" | "paused";

export function App() {
  const initial = useMemo(() => defaultRoomId(), []);
  const [roomId, setRoomId] = useState(initial);
  const [draftRoom, setDraftRoom] = useState(initial);
  const [phase, setPhase] = useState<Phase>("menu");
  const [menuScreen, setMenuScreen] = useState<MenuScreen>("main");

  const online = phase !== "menu";
  const { peerCount, selfId, status, statusDetail, sendState, style } =
    useMultiplayer(roomId, online);

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
          shadows="percentage"
          dpr={[1, 2]}
          camera={{ position: [0, 20, 170], fov: 68, near: 0.15, far: 8000 }}
          gl={{
            antialias: true,
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
