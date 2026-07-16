import * as THREE from "three";
import type { IcoFace } from "./chunkLod";
import { MOON_RADIUS } from "./moon";

/**
 * Camera-frustum tests for streamed ico faces.
 *
 * Streaming stays pup/horizon-centric ({@link cullFaces}); this module only
 * decides which resident faces are worth drawing / attaching. It uses the
 * real view-projection frustum — not board-forward / "behind the pup".
 */

/** Radial slack above crust so crater relief still intersects the frustum. */
const HEIGHT_MARGIN = 18;

const _projView = new THREE.Matrix4();
const _sphere = new THREE.Sphere();
const _center = new THREE.Vector3();
const _pa = new THREE.Vector3();
const _pb = new THREE.Vector3();
const _pc = new THREE.Vector3();
const _pt = new THREE.Vector3();

/** Write `out` from the camera's current projection × view matrices. */
export function updateCameraFrustum(
  camera: THREE.Camera,
  out: THREE.Frustum,
): THREE.Frustum {
  camera.updateMatrixWorld();
  _projView.multiplyMatrices(
    camera.projectionMatrix,
    camera.matrixWorldInverse,
  );
  return out.setFromProjectionMatrix(_projView);
}

/**
 * True when the face's world-space triangle (crust + height margin) intersects
 * the camera frustum. Corner-in + bounding-sphere tests catch large faces that
 * only clip the FOV at an edge — not a behind-pup hemisphere drop.
 */
export function faceIntersectsFrustum(
  face: IcoFace,
  frustum: THREE.Frustum,
  radius = MOON_RADIUS + HEIGHT_MARGIN,
): boolean {
  _pa.copy(face.a).multiplyScalar(radius);
  _pb.copy(face.b).multiplyScalar(radius);
  _pc.copy(face.c).multiplyScalar(radius);

  // Any corner inside → definitely visible (handles grazing FOV edges).
  if (frustum.containsPoint(_pa)) return true;
  if (frustum.containsPoint(_pb)) return true;
  if (frustum.containsPoint(_pc)) return true;

  _pt.copy(face.centroid).multiplyScalar(radius);
  if (frustum.containsPoint(_pt)) return true;

  // Sphere covers the case where all samples sit outside but the triangle
  // still crosses the view volume (common for large detail-1 faces).
  _center
    .copy(_pa)
    .add(_pb)
    .add(_pc)
    .multiplyScalar(1 / 3);
  const radSq = Math.max(
    _center.distanceToSquared(_pa),
    _center.distanceToSquared(_pb),
    _center.distanceToSquared(_pc),
  );
  _sphere.center.copy(_center);
  _sphere.radius = Math.sqrt(radSq);
  return frustum.intersectsSphere(_sphere);
}
