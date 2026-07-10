import * as THREE from "three";

export type MoonPbrMaps = {
  /** sRGB albedo detail (tiling). */
  albedo: THREE.DataTexture;
  /** Tangent-space normal detail. */
  normal: THREE.DataTexture;
  /** R=AO, G=roughness, B=metalness, A=height (linear). */
  orm: THREE.DataTexture;
  dispose: () => void;
};

function hash2(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function noise2(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy);
  const b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1);
  const d = hash2(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function fbm2(x: number, y: number, octaves: number): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise2(x * freq, y * freq);
    freq *= 2.11;
    amp *= 0.5;
  }
  return sum;
}

/** Height used to bake the normal + POM maps. Returns ~0..1. */
function heightAt(u: number, v: number): number {
  let h = fbm2(u * 4, v * 4, 5) * 0.5;
  h += fbm2(u * 14, v * 14, 4) * 0.28;
  h += noise2(u * 48, v * 48) * 0.14;
  h += noise2(u * 120, v * 120) * 0.06;
  // Sharpen midtones so parallax cavities read clearly.
  h = THREE.MathUtils.clamp(h, 0, 1);
  return h * h * (3 - 2 * h);
}

/**
 * Bake tiling PBR detail maps for lunar regolith.
 * Sampled triplanar in the moon shader (no mesh UVs required).
 */
export function createMoonPbrMaps(size = 512): MoonPbrMaps {
  const albedoData = new Uint8Array(size * size * 4);
  const normalData = new Uint8Array(size * size * 4);
  const ormData = new Uint8Array(size * size * 4);
  const eps = 1 / size;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const i = (y * size + x) * 4;

      const mottling = fbm2(u * 3.2, v * 3.2, 5);
      const fine = fbm2(u * 11, v * 11, 4);
      const speck = noise2(u * 64, v * 64);

      // Albedo — warm highland dust with darker basalt flecks.
      const basalt = mottling < 0.38 ? 1 : 0;
      let r = 0.58 + (fine - 0.5) * 0.1;
      let g = 0.55 + (fine - 0.5) * 0.09;
      let b = 0.48 + (fine - 0.5) * 0.07;
      r = r * (1 - basalt * 0.45) + 0.2 * basalt;
      g = g * (1 - basalt * 0.45) + 0.19 * basalt;
      b = b * (1 - basalt * 0.45) + 0.18 * basalt;
      // Iron oxide tint in places.
      const iron = Math.max(0, 0.45 - mottling) * 0.35;
      r += iron * 0.12;
      g -= iron * 0.04;
      b -= iron * 0.08;
      const grain = (speck - 0.5) * 0.08;
      r = THREE.MathUtils.clamp(r + grain, 0, 1);
      g = THREE.MathUtils.clamp(g + grain, 0, 1);
      b = THREE.MathUtils.clamp(b + grain, 0, 1);

      albedoData[i] = (r * 255) | 0;
      albedoData[i + 1] = (g * 255) | 0;
      albedoData[i + 2] = (b * 255) | 0;
      albedoData[i + 3] = 255;

      // Normal from heightfield — stronger for readable 3D relief.
      const h = heightAt(u, v);
      const hR = heightAt(u + eps, v);
      const hU = heightAt(u, v + eps);
      const strength = 4.2;
      let nx = (h - hR) * strength;
      let ny = (h - hU) * strength;
      let nz = 1;
      const invLen = 1 / Math.hypot(nx, ny, nz);
      nx *= invLen;
      ny *= invLen;
      nz *= invLen;
      normalData[i] = ((nx * 0.5 + 0.5) * 255) | 0;
      normalData[i + 1] = ((ny * 0.5 + 0.5) * 255) | 0;
      normalData[i + 2] = ((nz * 0.5 + 0.5) * 255) | 0;
      normalData[i + 3] = 255;

      // ORM: AO, roughness, metalness, height.
      const cavity = THREE.MathUtils.clamp(0.45 + h * 0.55, 0.45, 1);
      const roughness = THREE.MathUtils.clamp(
        0.9 + (fine - 0.5) * 0.12 + (1 - cavity) * 0.08,
        0.78,
        0.99,
      );
      // Trace ilmenite / glass beads — tiny metalness flecks only.
      const metal = speck > 0.92 ? 0.12 : speck > 0.85 ? 0.04 : 0;

      ormData[i] = (cavity * 255) | 0;
      ormData[i + 1] = (roughness * 255) | 0;
      ormData[i + 2] = (metal * 255) | 0;
      ormData[i + 3] = (h * 255) | 0;
    }
  }

  const albedo = new THREE.DataTexture(albedoData, size, size);
  albedo.colorSpace = THREE.SRGBColorSpace;
  albedo.wrapS = albedo.wrapT = THREE.RepeatWrapping;
  albedo.magFilter = THREE.LinearFilter;
  albedo.minFilter = THREE.LinearMipmapLinearFilter;
  albedo.generateMipmaps = true;
  albedo.needsUpdate = true;

  const normal = new THREE.DataTexture(normalData, size, size);
  normal.colorSpace = THREE.NoColorSpace;
  normal.wrapS = normal.wrapT = THREE.RepeatWrapping;
  normal.magFilter = THREE.LinearFilter;
  normal.minFilter = THREE.LinearMipmapLinearFilter;
  normal.generateMipmaps = true;
  normal.needsUpdate = true;

  const orm = new THREE.DataTexture(ormData, size, size);
  orm.colorSpace = THREE.NoColorSpace;
  orm.wrapS = orm.wrapT = THREE.RepeatWrapping;
  orm.magFilter = THREE.LinearFilter;
  orm.minFilter = THREE.LinearMipmapLinearFilter;
  orm.generateMipmaps = true;
  orm.needsUpdate = true;

  return {
    albedo,
    normal,
    orm,
    dispose() {
      albedo.dispose();
      normal.dispose();
      orm.dispose();
    },
  };
}
