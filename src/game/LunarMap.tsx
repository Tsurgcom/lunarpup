import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useMemo, useRef, useSyncExternalStore } from "react";
import * as THREE from "three";
import { getLocalPose } from "./localPose";
import {
  getPeer,
  getPeerIds,
  subscribeRoster,
} from "./peerStore";
import {
  createMoonGlobeGeometry,
  globeHitToWorld,
  worldToGlobe,
} from "./terrain";
import { requestTeleport } from "./teleport";

const GLOBE_RADIUS = 1;

type LunarMapProps = {
  selfId: string;
};

export function LunarMap({ selfId }: LunarMapProps) {
  return (
    <div className="hud__map">
      <div className="hud__map-label">Lunar map</div>
      <div className="hud__map-canvas">
        <Canvas
          dpr={[1, 1.5]}
          camera={{ position: [0, 0.35, 2.85], fov: 42, near: 0.1, far: 20 }}
          gl={{ antialias: true, alpha: true }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <color attach="background" args={["#070b12"]} />
          <LunarMapScene selfId={selfId} />
        </Canvas>
      </div>
      <p className="hud__map-hint">
        Drag to orbit · scroll to zoom · click surface or pup to warp
      </p>
    </div>
  );
}

function LunarMapScene({ selfId }: { selfId: string }) {
  const globe = useMemo(() => createMoonGlobeGeometry(GLOBE_RADIUS, 4), []);
  const drag = useRef({ active: false, x: 0, y: 0, moved: false });

  const onGlobePointerDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    drag.current = {
      active: true,
      x: e.clientX,
      y: e.clientY,
      moved: false,
    };
  };

  const onGlobePointerMove = (e: ThreeEvent<PointerEvent>) => {
    if (!drag.current.active) return;
    const dx = e.clientX - drag.current.x;
    const dy = e.clientY - drag.current.y;
    if (dx * dx + dy * dy > 36) drag.current.moved = true;
  };

  const onGlobePointerUp = (e: ThreeEvent<PointerEvent>) => {
    if (!drag.current.active) return;
    const wasClick = !drag.current.moved;
    drag.current.active = false;
    if (!wasClick) return;
    e.stopPropagation();
    const hit = globeHitToWorld(e.point);
    if (!hit) return;
    requestTeleport(hit.x, hit.z);
  };

  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight position={[3, 4, 2]} intensity={1.15} color="#fff4e0" />
      <hemisphereLight args={["#9bb7ff", "#2a241c", 0.35]} />

      <mesh
        geometry={globe}
        onPointerDown={onGlobePointerDown}
        onPointerMove={onGlobePointerMove}
        onPointerUp={onGlobePointerUp}
        onPointerLeave={() => {
          drag.current.active = false;
        }}
      >
        <meshStandardMaterial
          vertexColors
          roughness={0.92}
          metalness={0.04}
          flatShading={false}
        />
      </mesh>

      <SelfMarker />
      <PeerMarkers selfId={selfId} onWarp={requestTeleport} />

      <OrbitControls
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        minDistance={1.7}
        maxDistance={4.5}
        rotateSpeed={0.7}
        zoomSpeed={0.85}
      />
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
    worldToGlobe(pose.x, pose.z, GLOBE_RADIUS, tmp.current);
    tmp.current.multiplyScalar(1.04);
    m.position.copy(tmp.current);
  });

  return (
    <mesh ref={mesh}>
      <sphereGeometry args={[0.045, 12, 12]} />
      <meshStandardMaterial
        color="#f0c27a"
        emissive="#f0c27a"
        emissiveIntensity={0.55}
        roughness={0.4}
      />
    </mesh>
  );
}

function PeerMarkers({
  selfId,
  onWarp,
}: {
  selfId: string;
  onWarp: (x: number, z: number) => void;
}) {
  const peerIds = useSyncExternalStore(
    subscribeRoster,
    getPeerIds,
    getPeerIds,
  );

  return (
    <>
      {peerIds.map((id) =>
        id === selfId ? null : (
          <PeerMarker key={id} peerId={id} onWarp={onWarp} />
        ),
      )}
    </>
  );
}

function PeerMarker({
  peerId,
  onWarp,
}: {
  peerId: string;
  onWarp: (x: number, z: number) => void;
}) {
  const mesh = useRef<THREE.Mesh>(null);
  const tmp = useRef(new THREE.Vector3());
  const accent = useRef("#7eb6ff");

  useFrame(() => {
    const snap = getPeer(peerId);
    const m = mesh.current;
    if (!snap || !m) return;
    accent.current = snap.accent;
    worldToGlobe(snap.x, snap.z, GLOBE_RADIUS, tmp.current);
    tmp.current.multiplyScalar(1.045);
    m.position.copy(tmp.current);
    const mat = m.material as THREE.MeshStandardMaterial;
    if (mat.color.getStyle() !== snap.accent) {
      mat.color.set(snap.accent);
      mat.emissive.set(snap.accent);
    }
  });

  return (
    <mesh
      ref={mesh}
      onClick={(e) => {
        e.stopPropagation();
        const snap = getPeer(peerId);
        if (!snap) return;
        onWarp(snap.x, snap.z);
      }}
    >
      <sphereGeometry args={[0.05, 12, 12]} />
      <meshStandardMaterial
        color="#7eb6ff"
        emissive="#7eb6ff"
        emissiveIntensity={0.45}
        roughness={0.45}
      />
    </mesh>
  );
}
