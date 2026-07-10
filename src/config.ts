export const tuningSettings = [
    { key: 'maxSpeed', label: 'Max speed', min: 0.2, max: 2.4, step: 0.05 },
    { key: 'accel', label: 'Accel', min: 0.002, max: 0.06, step: 0.001 },
    { key: 'decel', label: 'Friction', min: 0.001, max: 0.05, step: 0.001 },
    { key: 'rotationSpeed', label: 'Turn speed', min: 0.005, max: 0.12, step: 0.005 },
    { key: 'jumpForce', label: 'Jump', min: 0.04, max: 0.45, step: 0.01 },
    { key: 'gravity', label: 'Gravity', min: 0.001, max: 0.02, step: 0.001 },
    { key: 'suspension', label: 'Suspension', min: 0.04, max: 0.7, step: 0.01 },
    { key: 'tiltSmoothing', label: 'Board tilt', min: 0.04, max: 0.6, step: 0.01 },
    { key: 'boostMultiplier', label: 'Boost max', min: 1.0, max: 3.5, step: 0.05 },
    { key: 'boostAccelMultiplier', label: 'Boost accel', min: 1.0, max: 5.0, step: 0.1 },
    { key: 'cameraBaseFov', label: 'Base FOV', min: 45, max: 85, step: 1 },
    { key: 'cameraMaxFov', label: 'Fast FOV', min: 60, max: 115, step: 1 },
] as const;

export type PhysicsKey = (typeof tuningSettings)[number]['key'];

export const physicsTuningDefaults: Readonly<Record<PhysicsKey, number>> = Object.freeze({
    maxSpeed: 0.8,
    accel: 0.015,
    decel: 0.01,
    rotationSpeed: 0.04,
    jumpForce: 0.15,
    gravity: 0.004,
    suspension: 0.22,
    tiltSmoothing: 0.18,
    boostMultiplier: 1.85,
    boostAccelMultiplier: 2.2,
    cameraBaseFov: 60,
    cameraMaxFov: 84,
});

export const chunkSize = 240;
export const terrainViewDistance = 3;
export const groundClearance = 0.42;

/**
 * LOD bias for terrain chunk detail. 1 = default thresholds; >1 keeps high detail
 * further out (crisper, heavier), <1 drops to low detail sooner (cheaper). A device
 * with a weak GPU can lower this; the tuning panel could expose it later.
 */
export const terrainLodBias = 1;

/**
 * Max terrain chunk geometries to BUILD per frame. Crossing a chunk border can bring
 * several new chunks into view at once; building them all in one frame is the stutter.
 * Cap the per-frame build work and queue the rest (nearest first) so the cost is spread
 * across a few frames instead of one spike. Unchanged chunks are never rebuilt.
 */
export const maxChunkBuildsPerFrame = 2;
