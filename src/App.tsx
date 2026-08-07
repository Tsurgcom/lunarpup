import { KeyboardControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { selfId as trysteroSelfId } from "@trystero-p2p/nostr";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { resetGhostSession } from "./game/ghostLine";
import { Hud } from "./game/Hud";
import { setHudSpeed } from "./game/hudSpeed";
import { LobbyMenu, type MenuScreen, PauseMenu, StartMenu } from "./game/Menus";
import { MOON_RADIUS, SPAWN_ALTITUDE, SPAWN_DIR } from "./game/moon";
import {
  setPartyPlayerName,
  setSessionPlayerName,
  useMultiplayer,
  useParty,
} from "./game/multiplayer";
import { sanitizeWorldId } from "./game/party";
import {
  getPerfSettings,
  resetPerformanceTier,
  subscribePerf,
} from "./game/performanceTiers";
import {
  fallbackPlayerName,
  loadPlayerName,
  sanitizePlayerName,
  savePlayerName,
} from "./game/playerName";
import {
  defaultPartyId,
  defaultWorldId,
  generatePartyCode,
  writePartyToUrl,
  writeWorldToUrl,
} from "./game/types";
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
  { name: "rollLeft", keys: ["KeyE"] },
  { name: "rollRight", keys: ["KeyQ"] },
  { name: "jump", keys: ["Space"] },
  { name: "boost", keys: ["ShiftLeft", "ShiftRight"] },
];

type Phase = "menu" | "lobby" | "playing" | "paused";

export function App() {
  const initialWorld = useMemo(() => defaultWorldId(), []);
  const initialParty = useMemo(() => defaultPartyId(), []);

  const [worldId, setWorldId] = useState(initialWorld);
  const [draftWorld, setDraftWorld] = useState(initialWorld);
  const [partyId, setPartyId] = useState<string | null>(null);
  const [draftParty, setDraftParty] = useState(initialParty ?? "");
  const [partyIsCreator, setPartyIsCreator] = useState(false);
  const [phase, setPhase] = useState<Phase>("menu");
  const [menuScreen, setMenuScreen] = useState<MenuScreen>("main");
  /** Last party startSeq we already consumed into playing. */
  const handledStartSeq = useRef(0);

  const nameFallback = useMemo(() => fallbackPlayerName(trysteroSelfId), []);
  const [draftName, setDraftName] = useState(() =>
    loadPlayerName(nameFallback),
  );
  const [playerName, setPlayerName] = useState(() =>
    loadPlayerName(nameFallback),
  );

  const shadows = useSyncExternalStore(
    subscribePerf,
    () => getPerfSettings().shadows,
    () => getPerfSettings().shadows,
  );
  const dpr = useSyncExternalStore(
    subscribePerf,
    () => getPerfSettings().dpr,
    () => getPerfSettings().dpr,
  );

  const worldActive = phase === "playing" || phase === "paused";
  const partyActive = partyId !== null && phase !== "menu";

  const { peerCount, selfId, status, statusDetail, sendState, style } =
    useMultiplayer(worldId, worldActive);

  const party = useParty(partyId, partyActive, playerName, partyIsCreator);

  // Seed names before first join (idempotent).
  useEffect(() => {
    setSessionPlayerName(playerName);
    setPartyPlayerName(playerName);
  }, [playerName]);

  // Boot at High before the Canvas mounts; scaler adjusts from there.
  useEffect(() => {
    resetPerformanceTier();
  }, []);

  // Deep link: ?party= opens lobby after boot.
  useEffect(() => {
    if (!initialParty) return;
    handledStartSeq.current = 0;
    setPartyId(initialParty);
    setDraftParty(initialParty);
    setPartyIsCreator(false);
    writePartyToUrl(initialParty);
    setMenuScreen("main");
    setPhase("lobby");
  }, [initialParty]);

  // Host Start / late join → open world and skate (keyed by startSeq so re-starts work).
  useEffect(() => {
    if (phase !== "lobby" || !party.started || !party.world) return;
    if (party.startSeq <= handledStartSeq.current) return;
    handledStartSeq.current = party.startSeq;
    const nextWorld = sanitizeWorldId(party.world);
    setWorldId(nextWorld);
    setDraftWorld(nextWorld);
    writeWorldToUrl(nextWorld);
    setMenuScreen("main");
    setPhase("playing");
  }, [phase, party.started, party.world, party.startSeq]);

  const commitName = useCallback(
    (raw: string) => {
      const next = sanitizePlayerName(raw, fallbackPlayerName(selfId));
      setDraftName(next);
      setPlayerName(next);
      savePlayerName(next);
      setSessionPlayerName(next);
      setPartyPlayerName(next);
      return next;
    },
    [selfId],
  );

  const applyWorld = useCallback(() => {
    const next = sanitizeWorldId(draftWorld);
    setWorldId(next);
    setDraftWorld(next);
    writeWorldToUrl(next);
    commitName(draftName);
  }, [draftWorld, draftName, commitName]);

  const enterWorld = useCallback(
    (nextWorld: string) => {
      const world = sanitizeWorldId(nextWorld);
      commitName(draftName);
      setPartyId(null);
      setPartyIsCreator(false);
      writePartyToUrl(null);
      setWorldId(world);
      setDraftWorld(world);
      writeWorldToUrl(world);
      setMenuScreen("main");
      setPhase("playing");
    },
    [draftName, commitName],
  );

  const enterParty = useCallback(
    (nextParty: string, asCreator: boolean) => {
      const id = nextParty.trim();
      if (!id) return;
      commitName(draftName);
      handledStartSeq.current = 0;
      setPartyId(id);
      setDraftParty(id);
      setPartyIsCreator(asCreator);
      writePartyToUrl(id);
      setMenuScreen("main");
      setPhase("lobby");
    },
    [draftName, commitName],
  );

  const onSkate = () => {
    enterWorld(draftWorld);
  };

  const onJoinWorld = () => {
    enterWorld(draftWorld);
  };

  const onCreateParty = () => {
    enterParty(generatePartyCode(), true);
  };

  const onJoinParty = () => {
    enterParty(draftParty, false);
  };

  const onResume = () => {
    commitName(draftName);
    setMenuScreen("main");
    setPhase("playing");
  };

  /** Solo → menu; in party → leave world, keep crew in lobby. */
  const onQuit = () => {
    setMenuScreen("main");
    setHudSpeed(0);
    resetGhostSession();
    if (partyId) {
      setPhase("lobby");
    } else {
      setPhase("menu");
    }
  };

  const onLeaveParty = useCallback(() => {
    handledStartSeq.current = 0;
    setPartyId(null);
    setPartyIsCreator(false);
    writePartyToUrl(null);
    setMenuScreen("main");
    setPhase("menu");
  }, []);

  const onCopyInvite = useCallback(async () => {
    if (!partyId) return;
    const url = new URL(window.location.href);
    url.searchParams.set("party", partyId);
    url.searchParams.delete("room");
    try {
      await navigator.clipboard.writeText(url.toString());
    } catch {
      /* clipboard may be denied */
    }
  }, [partyId]);

  const onLobbyStart = useCallback(() => {
    party.start(draftWorld);
  }, [party, draftWorld]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Escape") return;
      if (e.repeat) return;
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
      } else if (phase === "lobby") {
        onLeaveParty();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [phase, menuScreen, onLeaveParty]);

  return (
    <>
      {phase === "menu" ? (
        <StartMenu
          screen={menuScreen}
          onScreen={setMenuScreen}
          draftWorld={draftWorld}
          onDraftWorld={setDraftWorld}
          draftParty={draftParty}
          onDraftParty={setDraftParty}
          draftName={draftName}
          onDraftName={setDraftName}
          onSkate={onSkate}
          onJoinWorld={onJoinWorld}
          onCreateParty={onCreateParty}
          onJoinParty={onJoinParty}
        />
      ) : null}

      {phase === "lobby" && partyId ? (
        <LobbyMenu
          partyId={partyId}
          draftWorld={draftWorld}
          onDraftWorld={setDraftWorld}
          members={party.members}
          selfId={party.selfId}
          hostId={party.hostId}
          isHost={party.isHost}
          ready={party.ready}
          canStart={party.canStart}
          statusDetail={
            party.members.length > 1
              ? `${party.members.length} in party`
              : "waiting for friends…"
          }
          onReady={party.setReady}
          onStart={onLobbyStart}
          onLeave={onLeaveParty}
          onCopyInvite={onCopyInvite}
        />
      ) : null}

      {phase === "paused" ? (
        <PauseMenu
          screen={menuScreen}
          onScreen={setMenuScreen}
          draftWorld={draftWorld}
          onDraftWorld={setDraftWorld}
          draftName={draftName}
          onDraftName={setDraftName}
          onResume={onResume}
          onQuit={onQuit}
          onApplyWorld={applyWorld}
          onCopyInvite={onCopyInvite}
          worldId={worldId}
          partyId={partyId}
          peerCount={peerCount}
          playerName={playerName}
          status={status}
          statusDetail={statusDetail}
          members={party.members}
          selfId={party.selfId}
          hostId={party.hostId}
          isHost={party.isHost}
        />
      ) : null}

      {phase === "playing" ? (
        <Hud
          selfId={selfId}
          onPause={() => {
            setMenuScreen("main");
            setPhase("paused");
          }}
        />
      ) : null}

      <KeyboardControls map={keyMap}>
        <Canvas
          shadows={shadows ? "percentage" : false}
          dpr={[1, dpr]}
          camera={CANVAS_CAMERA}
          gl={{
            alpha: false,
            antialias: false,
            toneMappingExposure: 0.92,
            powerPreference: "high-performance",
          }}
        >
          <World
            fur={style.fur}
            accent={style.accent}
            name={playerName}
            active={worldActive}
            paused={phase === "paused"}
            onSnapshot={sendState}
          />
        </Canvas>
      </KeyboardControls>
    </>
  );
}
