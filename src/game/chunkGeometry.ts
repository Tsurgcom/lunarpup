import * as THREE from "three";
import { MOON_RADIUS } from "./moon";
import { writeMoonVertexColor } from "./moonMaterial";

/** Corners needed to tessellate one icosphere face patch. */
export type FaceCorners = {
  a: THREE.Vector3;
  b: THREE.Vector3;
  c: THREE.Vector3;
};

export type FaceGeometryData = {
  positions: Float32Array;
  colors: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
};

const _dir = new THREE.Vector3();
const _color = new Float32Array(3);

/**
 * Height sampler used while building patches.
 * Workers use the default (flat crust); the main thread may override via
 * {@link setChunkHeightSampler} once a terrain generator is registered.
 */
export type ChunkHeightSampler = (dir: THREE.Vector3) => number;

let heightSampler: ChunkHeightSampler = () => 0;

export function setChunkHeightSampler(sample: ChunkHeightSampler): void {
  heightSampler = sample;
}

export function getChunkHeightSampler(): ChunkHeightSampler {
  return heightSampler;
}

function sphereBary(
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
  u: number,
  v: number,
  out: THREE.Vector3,
): THREE.Vector3 {
  const w = 1 - u - v;
  return out
    .set(0, 0, 0)
    .addScaledVector(a, w)
    .addScaledVector(b, u)
    .addScaledVector(c, v)
    .normalize();
}

/**
 * Tessellate one spherical triangle into transferable buffer data.
 * Pure CPU — safe on the main thread or in a worker.
 */
export function createFaceGeometryData(
  face: FaceCorners,
  subdiv: number,
  radius = MOON_RADIUS,
): FaceGeometryData {
  const n = Math.max(1, subdiv | 0);
  const vertCount = ((n + 1) * (n + 2)) / 2;
  const triCount = n * n;
  const positions = new Float32Array(vertCount * 3);
  const colors = new Float32Array(vertCount * 3);
  const normals = new Float32Array(vertCount * 3);
  const indices = new Uint32Array(triCount * 3);

  const vertIndex = (i: number, j: number) => (j * (j + 1)) / 2 + i;

  let vi = 0;
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= j; i++) {
      const s = i / n;
      const t = (j - i) / n;
      sphereBary(face.a, face.b, face.c, s, t, _dir);
      const h = heightSampler(_dir);
      const r = radius + h;
      positions[vi * 3] = _dir.x * r;
      positions[vi * 3 + 1] = _dir.y * r;
      positions[vi * 3 + 2] = _dir.z * r;
      // Radial normal is correct for a sphere (and flat heightfield).
      normals[vi * 3] = _dir.x;
      normals[vi * 3 + 1] = _dir.y;
      normals[vi * 3 + 2] = _dir.z;
      writeMoonVertexColor(_dir, h, 0, _color, 0);
      colors[vi * 3] = _color[0]!;
      colors[vi * 3 + 1] = _color[1]!;
      colors[vi * 3 + 2] = _color[2]!;
      vi++;
    }
  }

  let ii = 0;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i <= j; i++) {
      const v0 = vertIndex(i, j);
      const v1 = vertIndex(i, j + 1);
      const v2 = vertIndex(i + 1, j + 1);
      // CW so normals point outward.
      indices[ii++] = v0;
      indices[ii++] = v2;
      indices[ii++] = v1;
      if (i < j) {
        const v3 = vertIndex(i + 1, j);
        indices[ii++] = v0;
        indices[ii++] = v3;
        indices[ii++] = v2;
      }
    }
  }

  return { positions, colors, normals, indices };
}

/** Wrap transferable buffers in a Three.js geometry (main thread only). */
export function faceGeometryFromData(
  data: FaceGeometryData,
): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(data.positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(data.colors, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(data.normals, 3));
  geo.setIndex(new THREE.BufferAttribute(data.indices, 1));
  return geo;
}
