import { describe, expect, test } from "bun:test";
import * as THREE from "three";
import { ChunkBatchManager } from "./chunkBatch";
import { createFaceGeometryData, faceGeometryFromData } from "./chunkGeometry";

describe("chunkBatch", () => {
  test("merges faces into one mesh per subdiv", () => {
    const root = new THREE.Group();
    const material = new THREE.MeshBasicMaterial();
    const batch = new ChunkBatchManager(root, material);

    const corners = {
      a: new THREE.Vector3(1, 0, 0),
      b: new THREE.Vector3(0, 1, 0),
      c: new THREE.Vector3(0, 0, 1),
    };
    const geoA = faceGeometryFromData(createFaceGeometryData(corners, 4));
    const geoB = faceGeometryFromData(createFaceGeometryData(corners, 4));

    batch.attach(0, 4, geoA);
    batch.attach(1, 4, geoB);
    expect(batch.faceCount()).toBe(2);
    expect(batch.has(0, 4)).toBe(true);
    expect(batch.has(1, 4)).toBe(true);
    expect(root.children.length).toBe(1);

    batch.attach(
      0,
      8,
      faceGeometryFromData(createFaceGeometryData(corners, 8)),
    );
    expect(batch.getSubdiv(0)).toBe(8);
    expect(batch.faceCount()).toBe(2);
    expect(root.children.length).toBe(2);

    batch.detach(1);
    expect(batch.faceCount()).toBe(1);
    expect(batch.has(1, 4)).toBe(false);

    batch.dispose();
    expect(root.children.length).toBe(0);
    geoA.dispose();
    geoB.dispose();
    material.dispose();
  });
});
