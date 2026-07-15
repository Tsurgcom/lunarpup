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
  /**
   * Topology index buffer for this subdiv. May be a shared template —
   * never transfer / detach this buffer; {@link faceGeometryFromData} copies it.
   */
  indices: Uint16Array | Uint32Array;
  /** Edge subdiv used to build this patch. */
  subdiv: number;
};

const _dir = new THREE.Vector3();
const _ab = new THREE.Vector3();
const _ac = new THREE.Vector3();
const _fn = new THREE.Vector3();
const _color = new Float32Array(3);

/** Reused across builds to avoid per-face height / normal scratch allocs. */
let heightScratch = new Float32Array(0);
let normalAccum = new Float32Array(0);

/** Shared index templates keyed by edge subdiv — topology is face-independent. */
const indexTemplates = new Map<number, Uint16Array | Uint32Array>();

/** Matches lunarTerrain HeightSampleQuality — local to avoid import cycles. */
type BuildHeightQuality = "near" | "mid" | "far";

function heightQualityForSubdiv(subdiv: number): BuildHeightQuality {
  if (subdiv <= 8) return "far";
  if (subdiv <= 24) return "mid";
  return "near";
}

/**
 * Height sampler used while building patches.
 * Workers use the default (flat crust); the main thread may override via
 * {@link setChunkHeightSampler} once a terrain generator is registered.
 */
export type ChunkHeightSampler = (
  dir: THREE.Vector3,
  quality?: BuildHeightQuality,
) => number;

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
 * Index buffer for a subdivided spherical triangle (shared across faces).
 * Prefer Uint16 while vertex count fits — smaller copies on the main thread.
 */
export function faceIndicesForSubdiv(
  subdiv: number,
): Uint16Array | Uint32Array {
  const n = Math.max(1, subdiv | 0);
  const cached = indexTemplates.get(n);
  if (cached) return cached;

  const vertCount = ((n + 1) * (n + 2)) / 2;
  const triCount = n * n;
  const indices =
    vertCount > 65535
      ? new Uint32Array(triCount * 3)
      : new Uint16Array(triCount * 3);

  const vertIndex = (i: number, j: number) => (j * (j + 1)) / 2 + i;
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

  indexTemplates.set(n, indices);
  return indices;
}

/**
 * Tessellate one spherical triangle into transferable buffer data.
 * Pure CPU — safe on the main thread or in a worker.
 *
 * Height is sampled once per vertex; normals are area-weighted from the
 * mesh (avoids 3× finite-difference height samples per vert).
 */
export function createFaceGeometryData(
  face: FaceCorners,
  subdiv: number,
  radius = MOON_RADIUS,
): FaceGeometryData {
  const n = Math.max(1, subdiv | 0);
  const quality = heightQualityForSubdiv(n);
  const vertCount = ((n + 1) * (n + 2)) / 2;
  const positions = new Float32Array(vertCount * 3);
  const colors = new Float32Array(vertCount * 3);
  const normals = new Float32Array(vertCount * 3);
  if (heightScratch.length < vertCount) {
    heightScratch = new Float32Array(vertCount);
  }
  const heights = heightScratch;
  const indices = faceIndicesForSubdiv(n);

  let vi = 0;
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= j; i++) {
      const s = i / n;
      const t = (j - i) / n;
      sphereBary(face.a, face.b, face.c, s, t, _dir);
      const h = heightSampler(_dir, quality);
      const r = radius + h;
      const o = vi * 3;
      positions[o] = _dir.x * r;
      positions[o + 1] = _dir.y * r;
      positions[o + 2] = _dir.z * r;
      heights[vi] = h;
      // Stash unit radial for slope colour after normals are ready.
      normals[o] = _dir.x;
      normals[o + 1] = _dir.y;
      normals[o + 2] = _dir.z;
      vi++;
    }
  }

  // Area-weighted face normals → smooth vertex normals (1 height sample / vert).
  if (normalAccum.length < vertCount * 3) {
    normalAccum = new Float32Array(vertCount * 3);
  } else {
    normalAccum.fill(0, 0, vertCount * 3);
  }
  const accum = normalAccum;
  for (let t = 0; t < indices.length; t += 3) {
    const ia = indices[t]! * 3;
    const ib = indices[t + 1]! * 3;
    const ic = indices[t + 2]! * 3;
    const ax = positions[ia]!;
    const ay = positions[ia + 1]!;
    const az = positions[ia + 2]!;
    _ab.set(
      positions[ib]! - ax,
      positions[ib + 1]! - ay,
      positions[ib + 2]! - az,
    );
    _ac.set(
      positions[ic]! - ax,
      positions[ic + 1]! - ay,
      positions[ic + 2]! - az,
    );
    _fn.crossVectors(_ab, _ac);
    // CW winding with outward radial — flip if the face normal tips inward.
    const cx = (ax + positions[ib]! + positions[ic]!) * (1 / 3);
    const cy = (ay + positions[ib + 1]! + positions[ic + 1]!) * (1 / 3);
    const cz = (az + positions[ib + 2]! + positions[ic + 2]!) * (1 / 3);
    if (_fn.x * cx + _fn.y * cy + _fn.z * cz < 0) _fn.negate();

    accum[ia] = accum[ia]! + _fn.x;
    accum[ia + 1] = accum[ia + 1]! + _fn.y;
    accum[ia + 2] = accum[ia + 2]! + _fn.z;
    accum[ib] = accum[ib]! + _fn.x;
    accum[ib + 1] = accum[ib + 1]! + _fn.y;
    accum[ib + 2] = accum[ib + 2]! + _fn.z;
    accum[ic] = accum[ic]! + _fn.x;
    accum[ic + 1] = accum[ic + 1]! + _fn.y;
    accum[ic + 2] = accum[ic + 2]! + _fn.z;
  }

  for (let i = 0; i < vertCount; i++) {
    const o = i * 3;
    const rx = normals[o]!;
    const ry = normals[o + 1]!;
    const rz = normals[o + 2]!;
    let nx = accum[o]!;
    let ny = accum[o + 1]!;
    let nz = accum[o + 2]!;
    const len = Math.hypot(nx, ny, nz);
    if (len > 1e-12) {
      nx /= len;
      ny /= len;
      nz /= len;
    } else {
      nx = rx;
      ny = ry;
      nz = rz;
    }
    normals[o] = nx;
    normals[o + 1] = ny;
    normals[o + 2] = nz;

    const slope = Math.hypot(nx - rx, ny - ry, nz - rz) * 4;
    _dir.set(rx, ry, rz);
    writeMoonVertexColor(_dir, heights[i]!, slope, _color, 0);
    colors[o] = _color[0]!;
    colors[o + 1] = _color[1]!;
    colors[o + 2] = _color[2]!;
  }

  return { positions, colors, normals, indices, subdiv: n };
}

/** Wrap transferable buffers in a Three.js geometry (main thread only). */
export function faceGeometryFromData(
  data: FaceGeometryData,
): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(data.positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(data.colors, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(data.normals, 3));
  // Copy indices — templates are shared and must not be neutered / disposed.
  const src = data.indices;
  const copy =
    src instanceof Uint16Array ? new Uint16Array(src) : new Uint32Array(src);
  geo.setIndex(new THREE.BufferAttribute(copy, 1));
  return geo;
}

/** Build geometry from worker payloads that omit the shared index template. */
export function faceGeometryFromWorkerData(
  positions: Float32Array,
  colors: Float32Array,
  normals: Float32Array,
  subdiv: number,
): THREE.BufferGeometry {
  return faceGeometryFromData({
    positions,
    colors,
    normals,
    indices: faceIndicesForSubdiv(subdiv),
    subdiv,
  });
}
