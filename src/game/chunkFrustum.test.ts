import { describe, expect, test } from "bun:test";
import * as THREE from "three";
import { faceIntersectsFrustum, updateCameraFrustum } from "./chunkFrustum";
import { getIcoFaces } from "./chunkLod";
import { MOON_RADIUS, SPAWN_DIR } from "./moon";

function chaseCameraLookingAt(target: THREE.Vector3): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.15, 8000);
  // Typical chase offset: behind and above the spawn point.
  const up = target.clone().normalize();
  const east = new THREE.Vector3(0, 1, 0).cross(up).normalize();
  if (east.lengthSq() < 1e-6) east.set(1, 0, 0);
  const back = up.clone().cross(east).normalize();
  camera.position.copy(target).addScaledVector(back, 14).addScaledVector(up, 6);
  camera.up.copy(up);
  camera.lookAt(target);
  camera.updateMatrixWorld(true);
  return camera;
}

describe("chunkFrustum", () => {
  test("spawn-facing faces intersect a chase camera frustum", () => {
    const target = SPAWN_DIR.clone().multiplyScalar(MOON_RADIUS);
    const camera = chaseCameraLookingAt(target);
    const frustum = new THREE.Frustum();
    updateCameraFrustum(camera, frustum);

    const near = getIcoFaces().find((f) => f.centroid.dot(SPAWN_DIR) > 0.95);
    expect(near).toBeDefined();
    expect(faceIntersectsFrustum(near!, frustum)).toBe(true);
  });

  test("far-side faces are outside the same frustum", () => {
    const target = SPAWN_DIR.clone().multiplyScalar(MOON_RADIUS);
    const camera = chaseCameraLookingAt(target);
    const frustum = new THREE.Frustum();
    updateCameraFrustum(camera, frustum);

    const far = getIcoFaces().find((f) => f.centroid.dot(SPAWN_DIR) < -0.5);
    expect(far).toBeDefined();
    expect(faceIntersectsFrustum(far!, frustum)).toBe(false);
  });

  test("lateral faces ahead of the board can still be in frustum", () => {
    // Camera yawed to look sideways — must not use board-forward cull.
    const target = SPAWN_DIR.clone().multiplyScalar(MOON_RADIUS);
    const up = SPAWN_DIR.clone();
    const east = new THREE.Vector3(0, 1, 0).cross(up).normalize();
    const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.15, 8000);
    camera.position.copy(target).addScaledVector(up, 8);
    camera.up.copy(up);
    camera.lookAt(target.clone().addScaledVector(east, 40));
    camera.updateMatrixWorld(true);

    const frustum = new THREE.Frustum();
    updateCameraFrustum(camera, frustum);

    const lateral = getIcoFaces().find((f) => {
      const along = f.centroid.dot(east);
      const radial = f.centroid.dot(SPAWN_DIR);
      return along > 0.35 && radial > 0.2;
    });
    expect(lateral).toBeDefined();
    expect(faceIntersectsFrustum(lateral!, frustum)).toBe(true);
  });
});
