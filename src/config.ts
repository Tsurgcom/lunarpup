export const tuningSettings = [
    { key: 'mass', label: 'Mass', min: 20, max: 200, step: 5 },
    { key: 'thrustForce', label: 'Thrust', min: 0.5, max: 6, step: 0.05 },
    { key: 'hoverStiffness', label: 'Hover stiffness', min: 0.4, max: 4, step: 0.05 },
    { key: 'hoverDamping', label: 'Hover damping', min: 0.05, max: 1.2, step: 0.01 },
    { key: 'maxHoverForce', label: 'Max hover force', min: 0.5, max: 12, step: 0.1 },
    { key: 'maxHoverRange', label: 'Hover range', min: 0.4, max: 2.5, step: 0.05 },
    { key: 'coastFriction', label: 'Coast friction', min: 0, max: 0.02, step: 0.001 },
    { key: 'coastDrag', label: 'Coast drag', min: 0, max: 0.01, step: 0.0002 },
    { key: 'airDrag', label: 'Air drag', min: 0, max: 0.08, step: 0.002 },
    { key: 'maxSpeed', label: 'HUD fast speed', min: 0.3, max: 2.4, step: 0.05 },
    { key: 'rotationSpeed', label: 'Turn speed', min: 0.005, max: 0.12, step: 0.005 },
    { key: 'jumpImpulse', label: 'Jump burst', min: 0.03, max: 0.25, step: 0.005 },
    { key: 'gravity', label: 'Gravity', min: 0.002, max: 0.03, step: 0.001 },
    { key: 'tiltSmoothing', label: 'Board align', min: 0.04, max: 0.6, step: 0.01 },
    { key: 'driftSlideMultiplier', label: 'Slope slide', min: 0, max: 0.35, step: 0.01 },
    { key: 'slideGrip', label: 'Lateral grip', min: 0, max: 0.05, step: 0.001 },
    { key: 'driftGripMultiplier', label: 'Drift grip', min: 0.05, max: 1, step: 0.05 },
    { key: 'driftThreshold', label: 'Drift threshold', min: 0.02, max: 0.5, step: 0.01 },
    { key: 'boostMultiplier', label: 'Boost max', min: 1.0, max: 3.5, step: 0.05 },
    { key: 'boostAccelMultiplier', label: 'Boost accel', min: 1.0, max: 5.0, step: 0.1 },
    { key: 'cameraBaseFov', label: 'Base FOV', min: 45, max: 85, step: 1 },
    { key: 'cameraMaxFov', label: 'Fast FOV', min: 60, max: 115, step: 1 },
] as const;

export type PhysicsKey = (typeof tuningSettings)[number]['key'];

export const chunkSize = 240;
export const terrainViewDistance = 3;
export const hoverClearance = 0.42;

/** @deprecated Use hoverClearance */
export const groundClearance = hoverClearance;
