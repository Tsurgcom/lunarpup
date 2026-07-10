import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { getLocalBody } from "./localBody";
import { getPeer, getPeerIds } from "./peerStore";
import {
  resolveCollisions,
  rockIsActive,
  spawnRocks,
  stepRocks,
  type PeerCollider,
  type RockKind,
  type RockState,
} from "./rockPhysics";

/** Match collision active radius — nearby instances stay visually in sync. */
const MATRIX_RADIUS2 = 14 * 14;

const KINDS: RockKind[] = ["pebble", "chunk", "slab", "shard", "boulder"];

const KIND_COLOR: Record<RockKind, string> = {
  pebble: "#c4bdb0",
  chunk: "#a39c90",
  slab: "#8f887c",
  shard: "#d0c9bc",
  boulder: "#7a7468",
};

/** Unit-radius base mesh per kind — instance matrix carries size + pose. */
function baseGeometry(kind: RockKind): THREE.BufferGeometry {
  switch (kind) {
    case "pebble":
      return new THREE.IcosahedronGeometry(1, 0);
    case "chunk":
      return new THREE.DodecahedronGeometry(1, 0);
    case "slab":
      return new THREE.BoxGeometry(1.6, 0.55, 1.3);
    case "shard": {
      const geo = new THREE.TetrahedronGeometry(1.15, 0);
      geo.scale(0.7, 0.85, 1.35);
      return geo;
    }
    case "boulder":
      return new THREE.IcosahedronGeometry(1, 0);
    default:
      return new THREE.IcosahedronGeometry(1, 0);
  }
}

type KindBucket = {
  kind: RockKind;
  indices: number[];
  mesh: THREE.InstancedMesh;
};

function writeRockMatrix(
  rock: RockState,
  matrix: THREE.Matrix4,
  scale: THREE.Vector3,
): void {
  scale.set(rock.radius, rock.radius, rock.radius);
  matrix.compose(rock.pos, rock.quat, scale);
}

export function LunarRocks() {
  const rocks = useMemo(() => spawnRocks(), []);
  const peerBuf = useRef<PeerCollider[]>([]);
  const matrix = useRef(new THREE.Matrix4());
  const scale = useRef(new THREE.Vector3());
  /** Rock indices that moved last frame — need one more matrix upload when they sleep. */
  const prevAwake = useRef<Set<number>>(new Set());

  const buckets = useMemo(() => {
    const byKind = new Map<RockKind, number[]>();
    for (const kind of KINDS) byKind.set(kind, []);
    rocks.forEach((rock, i) => {
      byKind.get(rock.kind)!.push(i);
    });

    return KINDS.map((kind) => {
      const indices = byKind.get(kind)!;
      const geo = baseGeometry(kind);
      // Lambert is enough for small debris; Standard + 800 shadow casters was the GPU killer.
      const mat = new THREE.MeshLambertMaterial({
        color: KIND_COLOR[kind],
        flatShading: true,
        fog: false,
      });
      const mesh = new THREE.InstancedMesh(geo, mat, indices.length);
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.frustumCulled = true;
      mesh.matrixAutoUpdate = false;
      return { kind, indices, mesh } satisfies KindBucket;
    });
  }, [rocks]);

  // Seat every instance once before the first paint.
  useLayoutEffect(() => {
    const m = matrix.current;
    const s = scale.current;
    for (const bucket of buckets) {
      for (let slot = 0; slot < bucket.indices.length; slot++) {
        const rock = rocks[bucket.indices[slot]!] as RockState;
        writeRockMatrix(rock, m, s);
        bucket.mesh.setMatrixAt(slot, m);
      }
      bucket.mesh.instanceMatrix.needsUpdate = true;
    }
  }, [buckets, rocks]);

  // After Player (default 0) so localBody is fresh; before remotes is fine.
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const body = getLocalBody();
    const playerPos = body?.pos ?? null;

    stepRocks(rocks, dt, playerPos);

    if (body) {
      const ids = getPeerIds();
      const peers = peerBuf.current;
      peers.length = 0;
      for (const id of ids) {
        const snap = getPeer(id);
        if (!snap) continue;
        peers.push(snap);
      }
      resolveCollisions(rocks, body.pos, body.vel, undefined, undefined, peers);
    }

    // Upload matrices for awake rocks, rocks that just slept, and anything
    // near the pup (collision may have nudged a sleeper this frame).
    const awake = prevAwake.current;
    const nextAwake = new Set<number>();
    const m = matrix.current;
    const s = scale.current;
    const px = playerPos?.x;
    const py = playerPos?.y;
    const pz = playerPos?.z;

    for (const bucket of buckets) {
      let dirty = false;
      for (let slot = 0; slot < bucket.indices.length; slot++) {
        const idx = bucket.indices[slot]!;
        const rock = rocks[idx] as RockState;
        const moving = rockIsActive(rock);
        if (moving) nextAwake.add(idx);

        let near = false;
        if (px !== undefined && py !== undefined && pz !== undefined) {
          const dx = rock.pos.x - px;
          const dy = rock.pos.y - py;
          const dz = rock.pos.z - pz;
          near = dx * dx + dy * dy + dz * dz <= MATRIX_RADIUS2;
        }

        if (!moving && !near && !awake.has(idx)) continue;
        writeRockMatrix(rock, m, s);
        bucket.mesh.setMatrixAt(slot, m);
        dirty = true;
      }
      if (dirty) bucket.mesh.instanceMatrix.needsUpdate = true;
    }
    prevAwake.current = nextAwake;
  });

  return (
    <group>
      {buckets.map((bucket) => (
        <primitive key={bucket.kind} object={bucket.mesh} />
      ))}
    </group>
  );
}
