import {
  Canvas,
  type ThreeEvent,
  useFrame,
  useThree,
} from "@react-three/fiber";
import {
  type MutableRefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import * as THREE from "three";
import { getLocalPose } from "./localPose";
import {
  CHART_RADIUS,
  chartHitToDir,
  createMoonChartGeometry,
  worldToChart,
} from "./moon";
import { boardAxes } from "./movement";
import { getPeer, getPeerIds, subscribeRoster } from "./peerStore";
import { requestTeleport } from "./teleport";

type LunarMapProps = {
  selfId: string;
};

type FocusAnim = {
  from: number;
  to: number;
  elapsed: number;
  dur: number;
};

/** Free orbit pose used while focused (around chart origin). */
type OrbitState = {
  pos: THREE.Vector3;
  up: THREE.Vector3;
  /** True after the user has dragged — stop auto-syncing to the locked view. */
  userMoved: boolean;
};

type DragState = {
  active: boolean;
  pointerId: number;
  x: number;
  y: number;
  moved: boolean;
};

const FOCUS_DUR = 0.45;
const COLLAPSE_DELAY_MS = 320;
/** Collapsed map refresh rate — avoids a full second WebGL loop at 60Hz. */
const IDLE_MAP_HZ = 10;
const NEAR_LIFT = 0.4;
const FAR_DIST = 2.9;
const NEAR_FOV = 48;
const FAR_FOV = 34;
const ORBIT_SENS = 0.0055;

const _origin = new THREE.Vector3(0, 0, 0);
const _eye = new THREE.Vector3();
const _up = new THREE.Vector3();
const _right = new THREE.Vector3();

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/**
 * Floating minimap — compact player-locked top-down when idle; expands on
 * hover to show the full globe. Focused: drag to orbit (trackball-style).
 */
export function LunarMap({ selfId }: LunarMapProps) {
  const [focused, setFocused] = useState(false);
  const focusRef = useRef(0);
  const animRef = useRef<FocusAnim>({
    from: 0,
    to: 0,
    elapsed: FOCUS_DUR,
    dur: FOCUS_DUR,
  });
  const orbitRef = useRef<OrbitState>({
    pos: new THREE.Vector3(0, 0, FAR_DIST),
    up: new THREE.Vector3(0, 1, 0),
    userMoved: false,
  });
  const dragRef = useRef<DragState>({
    active: false,
    pointerId: -1,
    x: 0,
    y: 0,
    moved: false,
  });
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerInside = useRef(false);

  const clearCollapseTimer = useCallback(() => {
    if (collapseTimer.current !== null) {
      clearTimeout(collapseTimer.current);
      collapseTimer.current = null;
    }
  }, []);

  const setFocusTarget = (to: number) => {
    const anim = animRef.current;
    if (anim.to === to) return;
    anim.from = focusRef.current;
    anim.to = to;
    anim.elapsed = 0;
    anim.dur = FOCUS_DUR;
    setFocused(to > 0.5);
    if (to < 0.5) orbitRef.current.userMoved = false;
  };

  const scheduleCollapse = () => {
    clearCollapseTimer();
    if (dragRef.current.active || pointerInside.current) return;
    collapseTimer.current = setTimeout(() => {
      collapseTimer.current = null;
      if (!pointerInside.current && !dragRef.current.active) {
        setFocusTarget(0);
      }
    }, COLLAPSE_DELAY_MS);
  };

  const scheduleCollapseRef = useRef(scheduleCollapse);
  scheduleCollapseRef.current = scheduleCollapse;

  const onHotEnter = () => {
    pointerInside.current = true;
    clearCollapseTimer();
    setFocusTarget(1);
  };

  const onHotLeave = () => {
    pointerInside.current = false;
    scheduleCollapse();
  };

  useEffect(() => () => clearCollapseTimer(), [clearCollapseTimer]);

  return (
    <div
      className="hud__map-hotzone"
      onPointerEnter={onHotEnter}
      onPointerLeave={onHotLeave}
    >
      <div className={`hud__map-float${focused ? " is-focused" : ""}`}>
        <div className="hud__map-canvas">
          <Canvas
            frameloop="demand"
            dpr={focused ? [1, 1.5] : [1, 1]}
            camera={{
              position: [0, 0, 2.5],
              fov: NEAR_FOV,
              near: 0.05,
              far: 20,
            }}
            gl={{
              antialias: focused,
              alpha: true,
              powerPreference: "low-power",
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <color attach="background" args={["#152238"]} />
            <MapFrameGate
              focused={focused}
              animRef={animRef}
              dragRef={dragRef}
            />
            <FocusDriver animRef={animRef} focusRef={focusRef} />
            <MapCamera
              focusRef={focusRef}
              orbitRef={orbitRef}
              dragRef={dragRef}
            />
            <MapOrbit
              focusRef={focusRef}
              orbitRef={orbitRef}
              dragRef={dragRef}
              scheduleCollapseRef={scheduleCollapseRef}
            />
            <LunarMapScene
              selfId={selfId}
              focused={focused}
              dragRef={dragRef}
            />
          </Canvas>
        </div>
        <p className="hud__map-hint" aria-hidden={!focused}>
          Drag to orbit · click to warp
        </p>
      </div>
    </div>
  );
}

/**
 * Demand-loop driver: keep rendering while focused / animating / dragging;
 * otherwise tick at IDLE_MAP_HZ so the self marker still crawls.
 */
function MapFrameGate({
  focused,
  animRef,
  dragRef,
}: {
  focused: boolean;
  animRef: MutableRefObject<FocusAnim>;
  dragRef: MutableRefObject<DragState>;
}) {
  const invalidate = useThree((s) => s.invalidate);

  // Kick the demand loop on mount and whenever focus toggles (starts anim).
  useEffect(() => {
    void focused;
    invalidate();
  }, [focused, invalidate]);

  useEffect(() => {
    if (focused) return;
    const id = window.setInterval(() => {
      const animating = animRef.current.elapsed < animRef.current.dur;
      if (animating || dragRef.current.active) return;
      invalidate();
    }, 1000 / IDLE_MAP_HZ);
    return () => window.clearInterval(id);
  }, [focused, invalidate, animRef, dragRef]);

  useFrame((state) => {
    const animating = animRef.current.elapsed < animRef.current.dur;
    if (focused || animating || dragRef.current.active) {
      state.invalidate();
    }
  });

  return null;
}

function FocusDriver({
  animRef,
  focusRef,
}: {
  animRef: MutableRefObject<FocusAnim>;
  focusRef: MutableRefObject<number>;
}) {
  useFrame((_, dt) => {
    const anim = animRef.current;
    if (anim.elapsed >= anim.dur) {
      focusRef.current = anim.to;
      return;
    }
    anim.elapsed = Math.min(anim.dur, anim.elapsed + dt);
    const u = easeInOutCubic(anim.elapsed / anim.dur);
    focusRef.current = anim.from + (anim.to - anim.from) * u;
  });
  return null;
}

/**
 * Trackball-style top-down when compact; free orbit around the origin when
 * focused (no fixed world-up axis).
 */
function MapCamera({
  focusRef,
  orbitRef,
  dragRef,
}: {
  focusRef: MutableRefObject<number>;
  orbitRef: MutableRefObject<OrbitState>;
  dragRef: MutableRefObject<DragState>;
}) {
  const { camera } = useThree();
  const chartPos = useRef(new THREE.Vector3());
  const radial = useRef(new THREE.Vector3());
  const forward = useRef(new THREE.Vector3());
  const right = useRef(new THREE.Vector3());
  const nearPos = useRef(new THREE.Vector3());
  const farPos = useRef(new THREE.Vector3());
  const camPos = useRef(new THREE.Vector3());
  const target = useRef(new THREE.Vector3());
  const farUp = useRef(new THREE.Vector3());

  useFrame(() => {
    const pose = getLocalPose();
    worldToChart(pose.x, pose.y, pose.z, chartPos.current);
    radial.current.copy(chartPos.current);
    if (radial.current.lengthSq() < 1e-8) radial.current.set(0, 0, 1);
    else radial.current.normalize();

    boardAxes(pose.yaw, radial.current, forward.current, right.current);

    nearPos.current
      .copy(chartPos.current)
      .addScaledVector(radial.current, NEAR_LIFT);
    farPos.current.copy(radial.current).multiplyScalar(FAR_DIST);

    const orbit = orbitRef.current;
    // Keep orbit locked to the player view until the user drags.
    if (!orbit.userMoved && !dragRef.current.active) {
      orbit.pos.copy(farPos.current);
      orbit.up.copy(forward.current);
    }

    farPos.current.copy(orbit.pos).setLength(FAR_DIST);
    farUp.current.copy(orbit.up).normalize();

    const f = focusRef.current;
    camPos.current.lerpVectors(nearPos.current, farPos.current, f);
    target.current.lerpVectors(chartPos.current, _origin, f);

    // Blend camera up: board-forward (near) → orbit up (far).
    camera.up.copy(forward.current).lerp(farUp.current, f).normalize();
    camera.position.copy(camPos.current);
    camera.lookAt(target.current);

    const persp = camera as THREE.PerspectiveCamera;
    const nextFov = THREE.MathUtils.lerp(NEAR_FOV, FAR_FOV, f);
    if (Math.abs(persp.fov - nextFov) > 1e-3) {
      persp.fov = nextFov;
      persp.updateProjectionMatrix();
    }
  });

  return null;
}

/** DOM-level drag orbit so empty sky still tracks the pointer. */
function MapOrbit({
  focusRef,
  orbitRef,
  dragRef,
  scheduleCollapseRef,
}: {
  focusRef: MutableRefObject<number>;
  orbitRef: MutableRefObject<OrbitState>;
  dragRef: MutableRefObject<DragState>;
  scheduleCollapseRef: MutableRefObject<() => void>;
}) {
  const { gl } = useThree();

  useEffect(() => {
    const el = gl.domElement;

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      if (focusRef.current < 0.55) return;
      dragRef.current = {
        active: true,
        pointerId: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        moved: false,
      };
      el.setPointerCapture(e.pointerId);
    };

    const onMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag.active || e.pointerId !== drag.pointerId) return;

      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      drag.x = e.clientX;
      drag.y = e.clientY;
      if (dx * dx + dy * dy > 9) drag.moved = true;
      if (!drag.moved) return;

      const orbit = orbitRef.current;
      orbit.userMoved = true;

      _eye.copy(orbit.pos);
      const eyeLen = _eye.length();
      _up.copy(orbit.up).normalize();

      // Camera looks at origin → right = up × eye (Three.js lookAt basis).
      _right.crossVectors(_up, _eye);
      if (_right.lengthSq() < 1e-10) return;
      _right.normalize();

      // Screen drag: right → yaw, down → pitch (grab-the-globe feel).
      _eye.applyAxisAngle(_up, -dx * ORBIT_SENS);
      _eye.applyAxisAngle(_right, -dy * ORBIT_SENS);
      _up.applyAxisAngle(_right, -dy * ORBIT_SENS);

      orbit.pos.copy(_eye).setLength(eyeLen || FAR_DIST);
      orbit.up.copy(_up).normalize();
    };

    const onUp = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag.active || e.pointerId !== drag.pointerId) return;
      drag.active = false;
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
      // Collapse only if the pointer already left the hotzone mid-drag.
      scheduleCollapseRef.current();
    };

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
    };
  }, [gl, focusRef, orbitRef, dragRef, scheduleCollapseRef]);

  return null;
}

function LunarMapScene({
  selfId,
  focused,
  dragRef,
}: {
  selfId: string;
  focused: boolean;
  dragRef: MutableRefObject<DragState>;
}) {
  const chart = useMemo(() => createMoonChartGeometry(CHART_RADIUS, 4), []);
  const hitDir = useRef(new THREE.Vector3());

  const onChartPointerUp = (e: ThreeEvent<PointerEvent>) => {
    if (!focused || dragRef.current.moved) return;
    e.stopPropagation();
    chartHitToDir(e.point, hitDir.current);
    requestTeleport(hitDir.current.x, hitDir.current.y, hitDir.current.z);
  };

  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight
        position={[2.5, 4, 1.5]}
        intensity={1.15}
        color="#fff4e0"
      />
      <hemisphereLight args={["#9bb7ff", "#2a241c", 0.35]} />

      <mesh geometry={chart} onPointerUp={onChartPointerUp}>
        <meshLambertMaterial vertexColors />
      </mesh>

      <SelfMarker />
      <PeerMarkers selfId={selfId} canTeleport={focused} dragRef={dragRef} />
    </>
  );
}

function SelfMarker() {
  const mesh = useRef<THREE.Mesh>(null);
  const tmp = useRef(new THREE.Vector3());

  useFrame(() => {
    const m = mesh.current;
    if (!m) return;
    const pose = getLocalPose();
    worldToChart(pose.x, pose.y, pose.z, tmp.current);
    tmp.current.multiplyScalar(1.04);
    m.position.copy(tmp.current);
  });

  return (
    <mesh ref={mesh}>
      <sphereGeometry args={[0.038, 8, 8]} />
      <meshToonMaterial color="#ffe566" />
    </mesh>
  );
}

function PeerMarkers({
  selfId,
  canTeleport,
  dragRef,
}: {
  selfId: string;
  canTeleport: boolean;
  dragRef: MutableRefObject<DragState>;
}) {
  const peerIds = useSyncExternalStore(subscribeRoster, getPeerIds, getPeerIds);

  return (
    <>
      {peerIds.map((id) =>
        id === selfId ? null : (
          <PeerMarker
            key={id}
            peerId={id}
            canTeleport={canTeleport}
            dragRef={dragRef}
          />
        ),
      )}
    </>
  );
}

function PeerMarker({
  peerId,
  canTeleport,
  dragRef,
}: {
  peerId: string;
  canTeleport: boolean;
  dragRef: MutableRefObject<DragState>;
}) {
  const mesh = useRef<THREE.Mesh>(null);
  const tmp = useRef(new THREE.Vector3());
  const accent = useRef("");

  useFrame(() => {
    const snap = getPeer(peerId);
    const m = mesh.current;
    if (!snap || !m) return;
    worldToChart(snap.x, snap.y, snap.z, tmp.current);
    tmp.current.multiplyScalar(1.045);
    m.position.copy(tmp.current);
    if (accent.current !== snap.accent) {
      accent.current = snap.accent;
      (m.material as THREE.MeshToonMaterial).color.set(snap.accent);
    }
  });

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: R3F mesh warp target, not DOM
    <mesh
      ref={mesh}
      onClick={(e) => {
        if (!canTeleport || dragRef.current.moved) return;
        e.stopPropagation();
        const snap = getPeer(peerId);
        if (!snap) return;
        requestTeleport(snap.x, snap.y, snap.z);
      }}
    >
      <sphereGeometry args={[0.042, 8, 8]} />
      <meshToonMaterial color="#7eb6ff" />
    </mesh>
  );
}
