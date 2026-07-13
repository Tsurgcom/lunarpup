import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { getLocalPose } from "./localPose";
import { createMoonMaterial } from "./moonMaterial";
import {
  CHUNK_ARC_RADIUS,
  createFaceGeometry,
  facesNear,
  getIcoFaces,
  stitchFaceSubdivs,
  type IcoFace,
} from "./terrain";

type FaceMesh = {
  mesh: THREE.Mesh;
  lod: number;
};

/**
 * Debug: overlay a wireframe on every terrain patch.
 * Enable with `?wireframe` on the URL.
 */
const DEBUG_WIREFRAME =
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).has("wireframe");

/** Placeholder so pooled meshes never hold a disposed geometry. */
const EMPTY_GEO = new THREE.BufferGeometry();

function createWireframeMaterial(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: "#7CFC00",
    wireframe: true,
    fog: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -4,
    depthTest: true,
  });
}

/**
 * Spherical clipmap: streams icosphere face patches around the pup (and
 * camera) and retessellates by geodesic distance so near-field geometry
 * matches the analytic heightfield used by collisions.
 */
export function MoonTerrain() {
  const group = useRef<THREE.Group>(null);
  const meshes = useRef(new Map<number, FaceMesh>());
  const geoCache = useRef(new Map<string, THREE.BufferGeometry>());
  const meshPool = useRef<THREE.Mesh[]>([]);
  const poseDir = useRef(new THREE.Vector3(0, 0, 1));
  const camDir = useRef(new THREE.Vector3(0, 0, 1));
  const viewerDir = useRef(new THREE.Vector3(0, 0, 1));
  const neededIds = useRef(new Set<number>());
  const nearPoseBuf = useRef<IcoFace[]>([]);
  const nearCamBuf = useRef<IcoFace[]>([]);
  const lodMap = useRef(new Map<number, number>());
  const lodIdsBuf = useRef<number[]>([]);
  const liveKeys = useRef(new Set<string>());

  const material = useMemo(() => createMoonMaterial(), []);
  const wireMaterial = useMemo(
    () => (DEBUG_WIREFRAME ? createWireframeMaterial() : null),
    [],
  );

  useLayoutEffect(() => {
    getIcoFaces();
    return () => {
      for (const entry of meshes.current.values()) {
        group.current?.remove(entry.mesh);
        releaseMesh(entry.mesh, meshPool.current);
      }
      meshes.current.clear();
      for (const mesh of meshPool.current) {
        disposeMeshTree(mesh);
      }
      meshPool.current.length = 0;
      for (const geo of geoCache.current.values()) geo.dispose();
      geoCache.current.clear();
      material.dispose();
      wireMaterial?.dispose();
    };
  }, [material, wireMaterial]);

  useFrame(({ camera }) => {
    const root = group.current;
    if (!root) return;

    const pose = getLocalPose();
    const pd = poseDir.current;
    pd.set(pose.x, pose.y, pose.z);
    if (pd.lengthSq() < 1e-6) pd.set(0, 0, 1);
    else pd.normalize();

    const cd = camDir.current;
    cd.copy(camera.position);
    if (cd.lengthSq() < 1e-6) cd.set(0, 0, 1);
    else cd.normalize();

    // LOD viewer: prefer the pup so tessellation tracks the board, not the
    // orbit boom. Blend toward camera only when looking far ahead.
    const vd = viewerDir.current;
    if (pd.dot(cd) > 0.92) {
      vd.copy(pd);
    } else {
      vd.copy(pd).add(cd).normalize();
    }

    const nearPose = facesNear(pd, CHUNK_ARC_RADIUS, nearPoseBuf.current);
    const nearCam =
      pd.dot(cd) > 0.92
        ? nearPose
        : facesNear(cd, CHUNK_ARC_RADIUS, nearCamBuf.current);
    const needed = neededIds.current;
    needed.clear();
    for (const f of nearPose) needed.add(f.index);
    for (const f of nearCam) needed.add(f.index);

    for (const [id, entry] of meshes.current) {
      if (needed.has(id)) continue;
      root.remove(entry.mesh);
      releaseMesh(entry.mesh, meshPool.current);
      meshes.current.delete(id);
    }

    const faces = getIcoFaces();
    const lods = stitchFaceSubdivs(
      vd,
      needed,
      lodMap.current,
      lodIdsBuf.current,
    );
    const live = liveKeys.current;
    live.clear();

    for (const id of needed) {
      const face = faces[id];
      if (!face) continue;
      const lod = lods.get(id) ?? 8;
      live.add(geoKey(face.index, lod));
      const existing = meshes.current.get(face.index);
      if (existing && existing.lod === lod) continue;
      if (existing) {
        root.remove(existing.mesh);
        releaseMesh(existing.mesh, meshPool.current);
        meshes.current.delete(face.index);
      }
      ensureMesh(
        face,
        lod,
        root,
        material,
        meshes.current,
        geoCache.current,
        meshPool.current,
        wireMaterial,
      );
    }

    // Evict geometries no longer referenced by the live clipmap.
    for (const [key, geo] of geoCache.current) {
      if (live.has(key)) continue;
      geo.dispose();
      geoCache.current.delete(key);
    }
  });

  return <group ref={group} />;
}

function geoKey(faceIndex: number, lod: number): string {
  return `${faceIndex}:${lod}`;
}

function releaseMesh(mesh: THREE.Mesh, pool: THREE.Mesh[]): void {
  mesh.geometry = EMPTY_GEO;
  for (const child of mesh.children) {
    if (child instanceof THREE.Mesh) child.geometry = EMPTY_GEO;
  }
  pool.push(mesh);
}

function disposeMeshTree(mesh: THREE.Mesh): void {
  for (const child of [...mesh.children]) {
    mesh.remove(child);
    if (child instanceof THREE.Mesh) {
      // Geometry is shared/cached or EMPTY_GEO — only dispose if EMPTY.
      child.geometry = EMPTY_GEO;
    }
  }
  mesh.geometry = EMPTY_GEO;
}

function ensureMesh(
  face: IcoFace,
  lod: number,
  root: THREE.Group,
  material: THREE.Material,
  meshes: Map<number, FaceMesh>,
  geoCache: Map<string, THREE.BufferGeometry>,
  pool: THREE.Mesh[],
  wireMaterial: THREE.Material | null,
): void {
  const key = geoKey(face.index, lod);
  let geometry = geoCache.get(key);
  if (!geometry) {
    geometry = createFaceGeometry(face, lod);
    geoCache.set(key, geometry);
  }

  let mesh = pool.pop();
  if (!mesh) {
    mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    if (wireMaterial) {
      const wire = new THREE.Mesh(geometry, wireMaterial);
      wire.receiveShadow = false;
      wire.castShadow = false;
      mesh.add(wire);
    }
  } else {
    mesh.geometry = geometry;
    mesh.material = material;
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    const wire = mesh.children[0];
    if (wire instanceof THREE.Mesh && wireMaterial) {
      wire.geometry = geometry;
      wire.material = wireMaterial;
    }
  }

  root.add(mesh);
  meshes.set(face.index, { mesh, lod });
}
