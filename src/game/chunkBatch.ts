import * as THREE from "three";

/**
 * Merges same-subdiv face patches into one mesh per ring so terrain draws
 * in a handful of calls instead of one mesh per ico face.
 */

const COMPACT_DEAD_RATIO = 0.35;
/** Starting face slots per ring (grows by doubling). */
const INITIAL_FACE_SLOTS = 8;

type FaceSlice = {
  faceIndex: number;
  vertStart: number;
  vertCount: number;
  indexStart: number;
  indexCount: number;
};

type RingState = {
  subdiv: number;
  mesh: THREE.Mesh;
  geometry: THREE.BufferGeometry;
  positions: Float32Array;
  colors: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  posAttr: THREE.BufferAttribute;
  colAttr: THREE.BufferAttribute;
  norAttr: THREE.BufferAttribute;
  idxAttr: THREE.BufferAttribute;
  vertCount: number;
  indexCount: number;
  capacityVerts: number;
  capacityIndices: number;
  slices: Map<number, FaceSlice>;
  deadVerts: number;
};

function vertsForSubdiv(subdiv: number): number {
  const n = Math.max(1, subdiv | 0);
  return ((n + 1) * (n + 2)) / 2;
}

function indicesForSubdiv(subdiv: number): number {
  const n = Math.max(1, subdiv | 0);
  return n * n * 3;
}

/**
 * Owns one Mesh per active subdiv; faces are appended as buffer slices.
 */
export class ChunkBatchManager {
  private readonly root: THREE.Object3D;
  private readonly material: THREE.Material;
  private readonly rings = new Map<number, RingState>();
  /** faceIndex → subdiv currently resident in a ring. */
  private readonly faceSubdiv = new Map<number, number>();

  constructor(root: THREE.Object3D, material: THREE.Material) {
    this.root = root;
    this.material = material;
  }

  /** Subdiv currently drawn for a face, if any. */
  getSubdiv(faceIndex: number): number | undefined {
    return this.faceSubdiv.get(faceIndex);
  }

  /** True when the face is already in the batch at this subdiv. */
  has(faceIndex: number, subdiv: number): boolean {
    return this.faceSubdiv.get(faceIndex) === subdiv;
  }

  /** Number of live face slices across all rings. */
  faceCount(): number {
    return this.faceSubdiv.size;
  }

  /** Iterate live faceIndex → subdiv pairs (for eviction). */
  *liveFaces(): Generator<[number, number], void, undefined> {
    for (const [faceIndex, subdiv] of this.faceSubdiv) {
      yield [faceIndex, subdiv];
    }
  }

  /**
   * Copy a face geometry into its subdiv ring. Swaps out any previous
   * subdiv for the same face.
   */
  attach(faceIndex: number, subdiv: number, geo: THREE.BufferGeometry): void {
    const prev = this.faceSubdiv.get(faceIndex);
    if (prev === subdiv) return;
    if (prev !== undefined) this.detach(faceIndex);

    const pos = geo.getAttribute("position");
    const col = geo.getAttribute("color");
    const nor = geo.getAttribute("normal");
    const idx = geo.getIndex();
    if (!pos || !col || !nor || !idx) return;

    const vertCount = pos.count;
    const indexCount = idx.count;
    const ring = this.ensureRing(subdiv, vertCount, indexCount);
    this.ensureCapacity(
      ring,
      ring.vertCount + vertCount,
      ring.indexCount + indexCount,
    );

    const vertBase = ring.vertCount;
    const indexBase = ring.indexCount;
    const srcPos = pos.array as Float32Array;
    const srcCol = col.array as Float32Array;
    const srcNor = nor.array as Float32Array;

    ring.positions.set(srcPos.subarray(0, vertCount * 3), vertBase * 3);
    ring.colors.set(srcCol.subarray(0, vertCount * 3), vertBase * 3);
    ring.normals.set(srcNor.subarray(0, vertCount * 3), vertBase * 3);

    const srcIdx = idx.array as Uint16Array | Uint32Array;
    for (let i = 0; i < indexCount; i++) {
      ring.indices[indexBase + i] = (srcIdx[i]! + vertBase) >>> 0;
    }

    ring.slices.set(faceIndex, {
      faceIndex,
      vertStart: vertBase,
      vertCount,
      indexStart: indexBase,
      indexCount,
    });
    ring.vertCount += vertCount;
    ring.indexCount += indexCount;
    this.faceSubdiv.set(faceIndex, subdiv);

    ring.posAttr.needsUpdate = true;
    ring.colAttr.needsUpdate = true;
    ring.norAttr.needsUpdate = true;
    ring.idxAttr.needsUpdate = true;
    ring.geometry.setDrawRange(0, ring.indexCount);
    ring.geometry.computeBoundingSphere();
  }

  /** Remove a face from whichever ring holds it. */
  detach(faceIndex: number): void {
    const subdiv = this.faceSubdiv.get(faceIndex);
    if (subdiv === undefined) return;
    const ring = this.rings.get(subdiv);
    if (!ring) {
      this.faceSubdiv.delete(faceIndex);
      return;
    }
    const slice = ring.slices.get(faceIndex);
    if (!slice) {
      this.faceSubdiv.delete(faceIndex);
      return;
    }

    // Degenerate the triangles so they stop drawing until compact.
    for (let i = 0; i < slice.indexCount; i++) {
      ring.indices[slice.indexStart + i] = 0;
    }
    ring.idxAttr.needsUpdate = true;
    ring.deadVerts += slice.vertCount;
    ring.slices.delete(faceIndex);
    this.faceSubdiv.delete(faceIndex);

    if (ring.slices.size === 0) {
      this.destroyRing(subdiv);
      return;
    }

    const liveVerts = ring.vertCount - ring.deadVerts;
    if (
      ring.deadVerts > 0 &&
      ring.deadVerts / Math.max(ring.vertCount, 1) >= COMPACT_DEAD_RATIO
    ) {
      this.compact(ring);
    } else if (liveVerts > 0) {
      ring.geometry.computeBoundingSphere();
    }
  }

  /** Drop every ring and mesh. */
  dispose(): void {
    for (const subdiv of [...this.rings.keys()]) {
      this.destroyRing(subdiv);
    }
    this.faceSubdiv.clear();
  }

  private ensureRing(
    subdiv: number,
    firstVerts: number,
    firstIndices: number,
  ): RingState {
    const existing = this.rings.get(subdiv);
    if (existing) return existing;

    const perFaceV = Math.max(firstVerts, vertsForSubdiv(subdiv));
    const perFaceI = Math.max(firstIndices, indicesForSubdiv(subdiv));
    const capacityVerts = perFaceV * INITIAL_FACE_SLOTS;
    const capacityIndices = perFaceI * INITIAL_FACE_SLOTS;

    const positions = new Float32Array(capacityVerts * 3);
    const colors = new Float32Array(capacityVerts * 3);
    const normals = new Float32Array(capacityVerts * 3);
    const indices = new Uint32Array(capacityIndices);

    const geometry = new THREE.BufferGeometry();
    const posAttr = new THREE.BufferAttribute(positions, 3);
    const colAttr = new THREE.BufferAttribute(colors, 3);
    const norAttr = new THREE.BufferAttribute(normals, 3);
    const idxAttr = new THREE.BufferAttribute(indices, 1);
    posAttr.setUsage(THREE.DynamicDrawUsage);
    colAttr.setUsage(THREE.DynamicDrawUsage);
    norAttr.setUsage(THREE.DynamicDrawUsage);
    idxAttr.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute("position", posAttr);
    geometry.setAttribute("color", colAttr);
    geometry.setAttribute("normal", norAttr);
    geometry.setIndex(idxAttr);
    geometry.setDrawRange(0, 0);

    const mesh = new THREE.Mesh(geometry, this.material);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.frustumCulled = true;
    this.root.add(mesh);

    const ring: RingState = {
      subdiv,
      mesh,
      geometry,
      positions,
      colors,
      normals,
      indices,
      posAttr,
      colAttr,
      norAttr,
      idxAttr,
      vertCount: 0,
      indexCount: 0,
      capacityVerts,
      capacityIndices,
      slices: new Map(),
      deadVerts: 0,
    };
    this.rings.set(subdiv, ring);
    return ring;
  }

  private ensureCapacity(
    ring: RingState,
    needVerts: number,
    needIndices: number,
  ): void {
    if (
      needVerts <= ring.capacityVerts &&
      needIndices <= ring.capacityIndices
    ) {
      return;
    }

    let nextVerts = ring.capacityVerts;
    while (nextVerts < needVerts) nextVerts *= 2;
    let nextIndices = ring.capacityIndices;
    while (nextIndices < needIndices) nextIndices *= 2;

    const positions = new Float32Array(nextVerts * 3);
    const colors = new Float32Array(nextVerts * 3);
    const normals = new Float32Array(nextVerts * 3);
    const indices = new Uint32Array(nextIndices);
    positions.set(ring.positions.subarray(0, ring.vertCount * 3));
    colors.set(ring.colors.subarray(0, ring.vertCount * 3));
    normals.set(ring.normals.subarray(0, ring.vertCount * 3));
    indices.set(ring.indices.subarray(0, ring.indexCount));

    ring.positions = positions;
    ring.colors = colors;
    ring.normals = normals;
    ring.indices = indices;
    ring.capacityVerts = nextVerts;
    ring.capacityIndices = nextIndices;

    ring.posAttr = new THREE.BufferAttribute(positions, 3);
    ring.colAttr = new THREE.BufferAttribute(colors, 3);
    ring.norAttr = new THREE.BufferAttribute(normals, 3);
    ring.idxAttr = new THREE.BufferAttribute(indices, 1);
    ring.posAttr.setUsage(THREE.DynamicDrawUsage);
    ring.colAttr.setUsage(THREE.DynamicDrawUsage);
    ring.norAttr.setUsage(THREE.DynamicDrawUsage);
    ring.idxAttr.setUsage(THREE.DynamicDrawUsage);
    ring.geometry.setAttribute("position", ring.posAttr);
    ring.geometry.setAttribute("color", ring.colAttr);
    ring.geometry.setAttribute("normal", ring.norAttr);
    ring.geometry.setIndex(ring.idxAttr);
  }

  private compact(ring: RingState): void {
    const live = [...ring.slices.values()];
    if (live.length === 0) {
      this.destroyRing(ring.subdiv);
      return;
    }

    let vertCount = 0;
    let indexCount = 0;
    for (const s of live) {
      vertCount += s.vertCount;
      indexCount += s.indexCount;
    }

    const positions = new Float32Array(Math.max(vertCount, 1) * 3);
    const colors = new Float32Array(Math.max(vertCount, 1) * 3);
    const normals = new Float32Array(Math.max(vertCount, 1) * 3);
    const indices = new Uint32Array(Math.max(indexCount, 1));

    let vOut = 0;
    let iOut = 0;
    const nextSlices = new Map<number, FaceSlice>();

    for (const s of live) {
      positions.set(
        ring.positions.subarray(
          s.vertStart * 3,
          (s.vertStart + s.vertCount) * 3,
        ),
        vOut * 3,
      );
      colors.set(
        ring.colors.subarray(s.vertStart * 3, (s.vertStart + s.vertCount) * 3),
        vOut * 3,
      );
      normals.set(
        ring.normals.subarray(s.vertStart * 3, (s.vertStart + s.vertCount) * 3),
        vOut * 3,
      );

      const delta = vOut - s.vertStart;
      for (let i = 0; i < s.indexCount; i++) {
        indices[iOut + i] = (ring.indices[s.indexStart + i]! + delta) >>> 0;
      }

      nextSlices.set(s.faceIndex, {
        faceIndex: s.faceIndex,
        vertStart: vOut,
        vertCount: s.vertCount,
        indexStart: iOut,
        indexCount: s.indexCount,
      });
      vOut += s.vertCount;
      iOut += s.indexCount;
    }

    ring.positions = positions;
    ring.colors = colors;
    ring.normals = normals;
    ring.indices = indices;
    ring.capacityVerts = Math.max(vertCount, vertsForSubdiv(ring.subdiv));
    ring.capacityIndices = Math.max(indexCount, indicesForSubdiv(ring.subdiv));
    ring.vertCount = vertCount;
    ring.indexCount = indexCount;
    ring.deadVerts = 0;
    ring.slices = nextSlices;

    ring.posAttr = new THREE.BufferAttribute(positions, 3);
    ring.colAttr = new THREE.BufferAttribute(colors, 3);
    ring.norAttr = new THREE.BufferAttribute(normals, 3);
    ring.idxAttr = new THREE.BufferAttribute(indices, 1);
    ring.posAttr.setUsage(THREE.DynamicDrawUsage);
    ring.colAttr.setUsage(THREE.DynamicDrawUsage);
    ring.norAttr.setUsage(THREE.DynamicDrawUsage);
    ring.idxAttr.setUsage(THREE.DynamicDrawUsage);
    ring.geometry.setAttribute("position", ring.posAttr);
    ring.geometry.setAttribute("color", ring.colAttr);
    ring.geometry.setAttribute("normal", ring.norAttr);
    ring.geometry.setIndex(ring.idxAttr);
    ring.geometry.setDrawRange(0, indexCount);
    ring.geometry.computeBoundingSphere();
  }

  private destroyRing(subdiv: number): void {
    const ring = this.rings.get(subdiv);
    if (!ring) return;
    for (const faceIndex of ring.slices.keys()) {
      this.faceSubdiv.delete(faceIndex);
    }
    this.root.remove(ring.mesh);
    ring.geometry.dispose();
    this.rings.delete(subdiv);
  }
}
