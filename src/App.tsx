import { Canvas } from "@react-three/fiber";
import { KeyboardControls } from "@react-three/drei";
import { useCallback, useMemo, useState } from "react";
import { Hud } from "./game/Hud";
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

export function App() {
  const initial = useMemo(() => defaultRoomId(), []);
  const [roomId, setRoomId] = useState(initial);
  const [draftRoom, setDraftRoom] = useState(initial);
  const [speed, setSpeed] = useState(0);

  const { peerCount, selfId, status, statusDetail, sendState, style } =
    useMultiplayer(roomId);

  const onSnapshot = useCallback(
    (snap: PlayerSnapshot) => {
      sendState(snap);
    },
    [sendState],
  );

  const onJoin = () => {
    const next = draftRoom.trim() || "moon-bowl";
    setRoomId(next);
    const url = new URL(window.location.href);
    url.searchParams.set("room", next);
    window.history.replaceState({}, "", url);
  };

  return (
    <>
      <Hud
        roomId={roomId}
        draftRoom={draftRoom}
        onDraftRoom={setDraftRoom}
        onJoin={onJoin}
        peerCount={peerCount}
        selfId={selfId}
        speed={speed}
        status={status}
        statusDetail={statusDetail}
      />
      <KeyboardControls map={keyMap}>
        <Canvas
          shadows
          dpr={[1, 1.75]}
          camera={{ position: [0, 8, 22], fov: 55, near: 0.1, far: 320 }}
          gl={{ antialias: true, toneMappingExposure: 1.05 }}
        >
          <World
            fur={style.fur}
            accent={style.accent}
            name={selfId.slice(0, 6)}
            onSnapshot={onSnapshot}
            onSpeed={setSpeed}
          />
        </Canvas>
      </KeyboardControls>
    </>
  );
}
