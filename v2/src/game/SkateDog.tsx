import { forwardRef, useLayoutEffect, useMemo, useRef } from "react";
import type { Ref } from "react";
import * as THREE from "three";
import type { Group } from "three";

type DogProps = {
  fur?: string;
  accent?: string;
  ghost?: boolean;
  /** Local pup stays visible under the camera; remotes can cull. */
  frustumCulled?: boolean;
};

type DogMaterials = {
  deck: THREE.MeshLambertMaterial;
  accent: THREE.MeshLambertMaterial;
  wheel: THREE.MeshLambertMaterial;
  fur: THREE.MeshLambertMaterial;
  muzzle: THREE.MeshLambertMaterial;
  ear: THREE.MeshLambertMaterial;
  eye: THREE.MeshLambertMaterial;
  pupil: THREE.MeshLambertMaterial;
};

const WHEEL_POSITIONS: [number, number, number][] = [
  [-0.18, 0.04, 0.42],
  [0.18, 0.04, 0.42],
  [-0.18, 0.04, -0.42],
  [0.18, 0.04, -0.42],
];

const LEG_POSITIONS: [number, number, number][] = [
  [-0.15, 0.22, 0.22],
  [0.15, 0.22, 0.22],
  [-0.15, 0.22, -0.22],
  [0.15, 0.22, -0.22],
];

const WHEEL_ROTATION: [number, number, number] = [0, 0, Math.PI / 2];
const TAIL_ROTATION: [number, number, number] = [0.45, 0, 0];

/** Shared across all pups — geometries are immutable after construction. */
const GEO = {
  deck: new THREE.BoxGeometry(0.55, 0.08, 1.35),
  grip: new THREE.BoxGeometry(0.42, 0.03, 1.15),
  wheel: new THREE.CylinderGeometry(0.09, 0.09, 0.1, 6),
  body: new THREE.BoxGeometry(0.44, 0.34, 0.72),
  head: new THREE.BoxGeometry(0.36, 0.32, 0.36),
  muzzle: new THREE.BoxGeometry(0.2, 0.14, 0.18),
  ear: new THREE.BoxGeometry(0.11, 0.2, 0.09),
  eye: new THREE.BoxGeometry(0.08, 0.08, 0.05),
  pupil: new THREE.BoxGeometry(0.04, 0.04, 0.04),
  leg: new THREE.BoxGeometry(0.11, 0.18, 0.13),
  tail: new THREE.BoxGeometry(0.09, 0.09, 0.3),
};

const BODY0 = 0.42;
const HEAD_OFF = 0.22;
const MUZZLE_OFF = 0.14;
const EAR_OFF = 0.42;
const EYE_OFF = 0.26;
const TAIL_OFF = 0.1;

function lambert(color: string, role: string): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ color });
  mat.userData.role = role;
  return mat;
}

function createDogMaterials(
  fur: string,
  accent: string,
  ghost: boolean,
): DogMaterials {
  const mats: DogMaterials = {
    deck: lambert("#3d2a1f", "deck"),
    accent: lambert(accent, "accent"),
    wheel: lambert("#2a221c", "wheel"),
    fur: lambert(fur, "fur"),
    muzzle: lambert("#f0a878", "muzzle"),
    ear: lambert("#d4895c", "ear"),
    eye: lambert("#fff8f0", "eye"),
    pupil: lambert("#1a1410", "pupil"),
  };
  tintDogMaterials(mats, fur, accent, ghost);
  return mats;
}

function tintDogMaterials(
  mats: DogMaterials,
  fur: string,
  accent: string,
  ghost: boolean,
): void {
  mats.fur.color.set(fur);
  mats.accent.color.set(accent);
  const opacity = ghost ? 0.38 : 1;
  for (const mat of Object.values(mats)) {
    mat.transparent = ghost;
    mat.opacity = opacity;
    mat.depthWrite = !ghost;
    mat.fog = !ghost;
  }
}

function setDogCastShadow(root: THREE.Object3D, ghost: boolean): void {
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const mat = obj.material;
    if (!(mat instanceof THREE.MeshLambertMaterial)) return;
    const role = mat.userData.role as string | undefined;
    if (role === "eye" || role === "pupil") return;
    obj.castShadow = !ghost;
  });
}

/** Imperative style update — use from useFrame instead of setState. */
export function applySkateDogStyle(
  root: THREE.Object3D,
  fur: string,
  accent: string,
  ghost: boolean,
): void {
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const mat = obj.material;
    if (!(mat instanceof THREE.MeshLambertMaterial)) return;
    const role = mat.userData.role as string | undefined;
    if (role === "fur") mat.color.set(fur);
    else if (role === "accent") mat.color.set(accent);
    mat.transparent = ghost;
    mat.opacity = ghost ? 0.38 : 1;
    mat.depthWrite = !ghost;
    mat.fog = !ghost;
    if (role !== "eye" && role !== "pupil") {
      obj.castShadow = !ghost;
    }
  });
}

function assignRef<T>(ref: Ref<T> | undefined, value: T | null): void {
  if (!ref) return;
  if (typeof ref === "function") ref(value);
  else ref.current = value;
}

/** Chunky geometric pup on a deck — rigid group, Lambert-lit for readable 3D. */
export const SkateDog = forwardRef<Group, DogProps>(function SkateDog(
  {
    fur = "#e8b86d",
    accent = "#ff8fab",
    ghost = false,
    frustumCulled = false,
  },
  ref,
) {
  const groupRef = useRef<Group>(null);
  const mats = useMemo(
    () => createDogMaterials(fur, accent, ghost),
    // Mount-only; later prop changes apply via layout effect / applySkateDogStyle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useLayoutEffect(() => {
    tintDogMaterials(mats, fur, accent, ghost);
    const root = groupRef.current;
    if (root) setDogCastShadow(root, ghost);
  }, [mats, fur, accent, ghost]);

  useLayoutEffect(
    () => () => {
      for (const mat of Object.values(mats)) mat.dispose();
    },
    [mats],
  );

  return (
    <group
      ref={(node) => {
        groupRef.current = node;
        assignRef(ref, node);
      }}
      frustumCulled={frustumCulled}
    >
      <mesh
        geometry={GEO.deck}
        material={mats.deck}
        position={[0, 0.08, 0]}
        frustumCulled={frustumCulled}
      />
      <mesh
        geometry={GEO.grip}
        material={mats.accent}
        position={[0, 0.13, 0]}
        frustumCulled={frustumCulled}
      />
      {WHEEL_POSITIONS.map((p, i) => (
        <mesh
          key={i}
          geometry={GEO.wheel}
          material={mats.wheel}
          position={p}
          rotation={WHEEL_ROTATION}
          frustumCulled={frustumCulled}
        />
      ))}

      <mesh
        geometry={GEO.body}
        material={mats.fur}
        position={[0, BODY0, 0.05]}
        frustumCulled={frustumCulled}
      />
      <mesh
        geometry={GEO.head}
        material={mats.fur}
        position={[0, BODY0 + HEAD_OFF, 0.5]}
        frustumCulled={frustumCulled}
      />
      <mesh
        geometry={GEO.muzzle}
        material={mats.muzzle}
        position={[0, BODY0 + MUZZLE_OFF, 0.7]}
        frustumCulled={frustumCulled}
      />

      <mesh
        geometry={GEO.ear}
        material={mats.ear}
        position={[-0.15, BODY0 + EAR_OFF, 0.44]}
        frustumCulled={frustumCulled}
      />
      <mesh
        geometry={GEO.ear}
        material={mats.ear}
        position={[0.15, BODY0 + EAR_OFF, 0.44]}
        frustumCulled={frustumCulled}
      />

      <mesh
        geometry={GEO.eye}
        material={mats.eye}
        position={[-0.09, BODY0 + EYE_OFF, 0.67]}
        frustumCulled={frustumCulled}
      />
      <mesh
        geometry={GEO.eye}
        material={mats.eye}
        position={[0.09, BODY0 + EYE_OFF, 0.67]}
        frustumCulled={frustumCulled}
      />
      <mesh
        geometry={GEO.pupil}
        material={mats.pupil}
        position={[-0.09, BODY0 + EYE_OFF, 0.7]}
        frustumCulled={frustumCulled}
      />
      <mesh
        geometry={GEO.pupil}
        material={mats.pupil}
        position={[0.09, BODY0 + EYE_OFF, 0.7]}
        frustumCulled={frustumCulled}
      />

      {LEG_POSITIONS.map((p, i) => (
        <mesh
          key={`leg-${i}`}
          geometry={GEO.leg}
          material={mats.fur}
          position={p}
          frustumCulled={frustumCulled}
        />
      ))}

      <mesh
        geometry={GEO.tail}
        material={mats.fur}
        position={[0, BODY0 + TAIL_OFF, -0.44]}
        rotation={TAIL_ROTATION}
        frustumCulled={frustumCulled}
      />
    </group>
  );
});
