import { useFrame } from "@react-three/fiber";
import type { RefObject } from "react";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { PlayerState } from "./movement";

const COUNT = 28;
const LIFE = 0.38;
const GRAVITY = 4.2;

type DustParticle = {
  active: boolean;
  life: number;
  maxLife: number;
  vx: number;
  vy: number;
  vz: number;
  nx: number;
  ny: number;
  nz: number;
};

type LandingDustProps = {
  state: RefObject<PlayerState>;
  /** When false, skip spawn + clear active puffs. */
  enabled: boolean;
};

/**
 * One-shot lunar dust burst on landing punch rising edge — not a trail.
 */
export function LandingDust({ state, enabled }: LandingDustProps) {
  const pointsRef = useRef<THREE.Points>(null);
  const prevPunch = useRef(0);
  const particles = useRef<DustParticle[]>([]);
  const positions = useRef(new Float32Array(COUNT * 3));
  const scratch = useRef({
    right: new THREE.Vector3(),
    forward: new THREE.Vector3(),
    up: new THREE.Vector3(),
    origin: new THREE.Vector3(),
  });

  useEffect(() => {
    const list: DustParticle[] = [];
    for (let i = 0; i < COUNT; i++) {
      list.push({
        active: false,
        life: 0,
        maxLife: LIFE,
        vx: 0,
        vy: 0,
        vz: 0,
        nx: 0,
        ny: 1,
        nz: 0,
      });
      positions.current[i * 3] = 0;
      positions.current[i * 3 + 1] = -9999;
      positions.current[i * 3 + 2] = 0;
    }
    particles.current = list;

    return () => {
      const pts = pointsRef.current;
      if (!pts) return;
      pts.geometry.dispose();
      const mat = pts.material;
      if (mat instanceof THREE.Material) mat.dispose();
    };
  }, []);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const s = state.current;
    const pts = pointsRef.current;
    if (!s || !pts) return;

    const punch = enabled ? s.landingPunch : 0;
    if (enabled && punch > prevPunch.current + 0.04) {
      spawnBurst(s, particles.current, positions.current, scratch.current);
    }
    prevPunch.current = punch;

    const posAttr = pts.geometry.getAttribute(
      "position",
    ) as THREE.BufferAttribute;
    const arr = positions.current;
    let anyActive = false;

    for (let i = 0; i < COUNT; i++) {
      const p = particles.current[i]!;
      if (!p.active) continue;
      anyActive = true;
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.active = false;
        arr[i * 3 + 1] = -9999;
        continue;
      }
      // Soft settle toward the surface (radial "down").
      const settle = GRAVITY * dt * 0.35;
      p.vx -= p.nx * settle;
      p.vy -= p.ny * settle;
      p.vz -= p.nz * settle;
      const ix = i * 3;
      arr[ix]! += p.vx * dt;
      arr[ix + 1]! += p.vy * dt;
      arr[ix + 2]! += p.vz * dt;
      p.vx *= 1 - 2.8 * dt;
      p.vy *= 1 - 1.4 * dt;
      p.vz *= 1 - 2.8 * dt;
    }

    if (anyActive || pts.visible) {
      posAttr.needsUpdate = true;
      const mat = pts.material as THREE.PointsMaterial;
      // Fade whole burst from peak opacity — simple + cheap.
      let maxRemain = 0;
      for (const p of particles.current) {
        if (!p.active) continue;
        maxRemain = Math.max(maxRemain, 1 - p.life / p.maxLife);
      }
      mat.opacity = 0.55 * maxRemain;
      pts.visible = maxRemain > 0.01;
    }
  });

  return (
    <points ref={pointsRef} frustumCulled={false} visible={false}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions.current, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        color="#c4b49a"
        size={0.22}
        sizeAttenuation
        transparent
        opacity={0.55}
        depthWrite={false}
        fog
      />
    </points>
  );
}

function spawnBurst(
  s: PlayerState,
  particles: DustParticle[],
  positions: Float32Array,
  scratch: {
    right: THREE.Vector3;
    forward: THREE.Vector3;
    up: THREE.Vector3;
    origin: THREE.Vector3;
  },
): void {
  const up = scratch.up.copy(s.contactNormal).normalize();
  if (up.lengthSq() < 1e-8) up.copy(s.up).normalize();
  scratch.origin.copy(s.pos).addScaledVector(up, 0.12);

  // Orthonormal tangent basis from surface normal.
  const right = scratch.right;
  right.set(1, 0, 0);
  if (Math.abs(up.dot(right)) > 0.9) right.set(0, 0, 1);
  right.crossVectors(up, right).normalize();
  const forward = scratch.forward.crossVectors(right, up).normalize();

  const strength = 0.55 + Math.min(1.2, s.landingPunch) * 0.65;

  for (let i = 0; i < COUNT; i++) {
    const p = particles[i]!;
    p.active = true;
    p.life = 0;
    p.maxLife = LIFE * (0.78 + Math.random() * 0.35);

    const a = Math.random() * Math.PI * 2;
    const radial = (0.6 + Math.random() * 1.4) * strength;
    const lift = (0.35 + Math.random() * 0.9) * strength;
    const rx = Math.cos(a) * radial;
    const rz = Math.sin(a) * radial;

    p.vx = right.x * rx + forward.x * rz + up.x * lift;
    p.vy = right.y * rx + forward.y * rz + up.y * lift;
    p.vz = right.z * rx + forward.z * rz + up.z * lift;
    p.nx = up.x;
    p.ny = up.y;
    p.nz = up.z;

    const jitter = 0.05 + Math.random() * 0.08;
    const ix = i * 3;
    positions[ix] =
      scratch.origin.x +
      right.x * Math.cos(a) * jitter +
      forward.x * Math.sin(a) * jitter;
    positions[ix + 1] =
      scratch.origin.y +
      right.y * Math.cos(a) * jitter +
      forward.y * Math.sin(a) * jitter;
    positions[ix + 2] =
      scratch.origin.z +
      right.z * Math.cos(a) * jitter +
      forward.z * Math.sin(a) * jitter;
  }
}
