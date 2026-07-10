import * as THREE from "three";

/** Fixed sun bearing in world space (unit). Disc + IBL use this. */
export const SUN_DIR = new THREE.Vector3(0.72, 0.52, 0.46).normalize();

/**
 * Live key-light direction (from disc toward the pup). Updated each frame by
 * `Sun` so shadow maps and POM self-shadow stay aligned with the sky disc.
 */
export const sunLightDir = SUN_DIR.clone();

export function setSunLightDir(dir: THREE.Vector3): void {
  sunLightDir.copy(dir);
  if (sunLightDir.lengthSq() < 1e-8) sunLightDir.copy(SUN_DIR);
  else sunLightDir.normalize();
}
