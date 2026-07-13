import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef, useSyncExternalStore } from "react";
import * as THREE from "three";
import {
  getGhostLine,
  getLineHud,
  sampleGhostPose,
  subscribeLineHud,
} from "./ghostLine";
import { SkateDog } from "./SkateDog";
import { ACCENT_PALETTE } from "./types";

const GHOST_FUR = "#c8d4e8";
const GHOST_ACCENT = ACCENT_PALETTE[2]!;

type GhostRunProps = {
  /** Shown while the pause menu is open (when a saved line exists). */
  paused: boolean;
};

/**
 * Personal-best ghost pup + path — visible on the pause menu.
 * Subscribe only while paused so skating doesn't re-render this node.
 */
export function GhostRun({ paused }: GhostRunProps) {
  if (!paused) return null;
  return <GhostRunVisible />;
}

function GhostRunVisible() {
  const hud = useSyncExternalStore(subscribeLineHud, getLineHud, getLineHud);
  if (!hud.hasGhost) return null;

  return (
    <>
      <GhostPup />
      <GhostPath bestDist={hud.bestDist} />
    </>
  );
}

function GhostPath({ bestDist }: { bestDist: number }) {
  const obj = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const mat = new THREE.LineBasicMaterial({
      color: GHOST_ACCENT,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    });
    const line = new THREE.Line(geo, mat);
    line.frustumCulled = false;
    return line;
  }, []);

  useLayoutEffect(() => {
    const ghost = getGhostLine();
    const geo = obj.geometry;
    if (!ghost || ghost.samples.length < 2) {
      geo.setDrawRange(0, 0);
      return;
    }
    const n = ghost.samples.length;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const s = ghost.samples[i]!;
      pos[i * 3] = s.x;
      pos[i * 3 + 1] = s.y;
      pos[i * 3 + 2] = s.z;
    }
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setDrawRange(0, n);
    geo.computeBoundingSphere();
  }, [bestDist, obj]);

  return <primitive object={obj} />;
}

function GhostPup() {
  const ref = useRef<THREE.Group>(null);
  const tRef = useRef(0);
  const euler = useRef(new THREE.Euler());
  const quat = useRef(new THREE.Quaternion());
  const pose = useRef({
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    pitch: 0,
    roll: 0,
  });

  useFrame((_, rawDt) => {
    const line = getGhostLine();
    const g = ref.current;
    if (!line || !g) return;

    const dt = Math.min(rawDt, 0.05);
    tRef.current += dt;
    if (!sampleGhostPose(line, tRef.current, pose.current)) return;

    const p = pose.current;
    g.position.set(p.x, p.y, p.z);
    euler.current.set(p.pitch, p.yaw, p.roll, "YXZ");
    quat.current.setFromEuler(euler.current);
    g.quaternion.copy(quat.current);
  });

  return (
    <SkateDog ref={ref} fur={GHOST_FUR} accent={GHOST_ACCENT} ghost />
  );
}
