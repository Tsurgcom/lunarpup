import type * as THREE from 'three';
import type { JumpInputState, PhysicsState } from './types.ts';
import { getTerrainNormal } from './terrain.ts';

export const JUMP_BUFFER_MS = 150;
export const COYOTE_TIME_MS = 100;

export interface DriveInput {
    forward: boolean;
    reverse: boolean;
    boosting: boolean;
}

export type HoverPhysicsParams = Pick<
    PhysicsState,
    | 'mass'
    | 'thrustForce'
    | 'coastFriction'
    | 'coastDrag'
    | 'airDrag'
    | 'gravity'
    | 'hoverStiffness'
    | 'hoverDamping'
    | 'maxHoverForce'
    | 'driftSlideMultiplier'
    | 'slideGrip'
    | 'driftGripMultiplier'
    | 'driftThreshold'
    | 'boostMultiplier'
    | 'boostAccelMultiplier'
>;

export function wantsJump(input: JumpInputState, now: number) {
    return input.queuedAt > 0 && now - input.queuedAt <= JUMP_BUFFER_MS;
}

export function consumeJumpRequest(input: { queuedAt: number }) {
    input.queuedAt = 0;
}

export function canCoyoteJump(isGrounded: boolean, airTimeSeconds: number) {
    return !isGrounded && airTimeSeconds * 1000 <= COYOTE_TIME_MS;
}

export function stepHeading(
    heading: number,
    rotationSpeed: number,
    turnLeft: boolean,
    turnRight: boolean,
    frameScale: number,
) {
    let next = heading;
    if (turnLeft) next += rotationSpeed * frameScale;
    if (turnRight) next -= rotationSpeed * frameScale;
    return next;
}

export function projectOntoPlane(
    vector: THREE.Vector3,
    normal: THREE.Vector3,
    out: THREE.Vector3,
) {
    return out.copy(vector).addScaledVector(normal, -vector.dot(normal));
}

export function getHeadingForward(heading: number, out: THREE.Vector3) {
    return out.set(Math.sin(heading), 0, Math.cos(heading));
}

export function getSlopeForward(
    heading: number,
    normal: THREE.Vector3,
    scratch: { baseForward: THREE.Vector3; slopeForward: THREE.Vector3 },
) {
    scratch.baseForward.set(Math.sin(heading), 0, Math.cos(heading));
    projectOntoPlane(scratch.baseForward, normal, scratch.slopeForward);
    if (scratch.slopeForward.lengthSq() < 1e-8) {
        scratch.slopeForward.set(0, 0, 1);
    } else {
        scratch.slopeForward.normalize();
    }
    return scratch.slopeForward;
}

export function getGroundSpeed(velocity: THREE.Vector3, slopeForward: THREE.Vector3) {
    return velocity.dot(slopeForward);
}

export function getDisplaySpeed(
    physics: Pick<PhysicsState, 'velocity' | 'heading' | 'isGrounded'>,
    x: number,
    z: number,
    scratch: {
        baseForward: THREE.Vector3;
        slopeForward: THREE.Vector3;
        terrainNormal: THREE.Vector3;
    },
) {
    const forward = physics.isGrounded
        ? getSlopeForward(physics.heading, getTerrainNormal(x, z, scratch), scratch)
        : getHeadingForward(physics.heading, scratch.slopeForward);
    return getGroundSpeed(physics.velocity, forward);
}

export function getHoverPadPulse(
    velocity: THREE.Vector3,
    normal: THREE.Vector3,
    slopeForward: THREE.Vector3,
    tangentOut: THREE.Vector3,
) {
    projectOntoPlane(velocity, normal, tangentOut);
    const tangentSpeed = tangentOut.length();
    if (tangentSpeed < 1e-6) return 0;
    const groundSpeed = velocity.dot(slopeForward);
    return Math.sign(groundSpeed || tangentOut.dot(slopeForward) || 1) * tangentSpeed;
}

export function getGravityTangent(
    gravity: number,
    normal: THREE.Vector3,
    out: THREE.Vector3,
) {
    const gravityAlongNormal = -gravity * normal.y;
    return out.set(
        -normal.x * gravityAlongNormal,
        -gravity - normal.y * gravityAlongNormal,
        -normal.z * gravityAlongNormal,
    );
}

export function getEffectiveSlideGrip(
    physics: Pick<HoverPhysicsParams, 'slideGrip' | 'driftGripMultiplier' | 'driftThreshold'>,
    lateralSpeed: number,
) {
    if (physics.slideGrip <= 0) return 0;
    if (lateralSpeed > physics.driftThreshold) {
        return physics.slideGrip * physics.driftGripMultiplier;
    }
    return physics.slideGrip;
}

export function computeHoverDriveAcceleration(
    physics: HoverPhysicsParams,
    velocity: THREE.Vector3,
    input: DriveInput,
    normal: THREE.Vector3,
    slopeForward: THREE.Vector3,
    scratch: { acceleration: THREE.Vector3; tangentVelocity: THREE.Vector3 },
) {
    const { acceleration, tangentVelocity } = scratch;
    acceleration.set(0, 0, 0);
    getGravityTangent(physics.gravity * physics.driftSlideMultiplier, normal, acceleration);

    projectOntoPlane(velocity, normal, tangentVelocity);
    const groundSpeed = getGroundSpeed(velocity, slopeForward);
    const tangentSpeed = tangentVelocity.length();

    if (tangentSpeed > 1e-6) {
        const lateralX = tangentVelocity.x - slopeForward.x * groundSpeed;
        const lateralY = tangentVelocity.y - slopeForward.y * groundSpeed;
        const lateralZ = tangentVelocity.z - slopeForward.z * groundSpeed;
        const lateralSpeed = Math.hypot(lateralX, lateralY, lateralZ);
        const grip = getEffectiveSlideGrip(physics, lateralSpeed);
        if (grip > 0 && lateralSpeed > 1e-6) {
            acceleration.x -= (lateralX / lateralSpeed) * grip;
            acceleration.y -= (lateralY / lateralSpeed) * grip;
            acceleration.z -= (lateralZ / lateralSpeed) * grip;
        }
    }

    if (input.forward || input.reverse) {
        const thrustAccel = (physics.thrustForce / physics.mass)
            * (input.boosting ? physics.boostAccelMultiplier : 1);

        if (input.forward) {
            acceleration.addScaledVector(slopeForward, thrustAccel);
        }
        if (input.reverse) {
            acceleration.addScaledVector(slopeForward, -thrustAccel * 0.85);
        }
    } else if (tangentSpeed > 1e-6) {
        acceleration.addScaledVector(tangentVelocity, -physics.coastFriction / tangentSpeed);
    }

    if (tangentSpeed > 1e-6 && physics.coastDrag > 0) {
        acceleration.addScaledVector(tangentVelocity, -physics.coastDrag / tangentSpeed);
    }

    return acceleration;
}

export function computeHoverNormalAcceleration(
    physics: Pick<HoverPhysicsParams, 'mass' | 'hoverStiffness' | 'hoverDamping' | 'maxHoverForce'>,
    heightAbove: number,
    hoverClearance: number,
    velAlongNormal: number,
    normal: THREE.Vector3,
    out: THREE.Vector3,
) {
    const error = hoverClearance - heightAbove;
    const rawAccel = (physics.hoverStiffness * error - physics.hoverDamping * velAlongNormal) / physics.mass;
    const clampedAccel = Math.max(-physics.maxHoverForce / physics.mass, Math.min(physics.maxHoverForce / physics.mass, rawAccel));
    return out.copy(normal).multiplyScalar(clampedAccel);
}

export function computeHoverAcceleration(
    physics: HoverPhysicsParams,
    velocity: THREE.Vector3,
    input: DriveInput,
    normal: THREE.Vector3,
    slopeForward: THREE.Vector3,
    heightAbove: number,
    hoverClearance: number,
    scratch: { acceleration: THREE.Vector3; tangentVelocity: THREE.Vector3; normalAcceleration: THREE.Vector3 },
) {
    computeHoverDriveAcceleration(physics, velocity, input, normal, slopeForward, scratch);
    const velAlongNormal = velocity.dot(normal);
    computeHoverNormalAcceleration(
        physics,
        heightAbove,
        hoverClearance,
        velAlongNormal,
        normal,
        scratch.normalAcceleration,
    );
    scratch.acceleration.add(scratch.normalAcceleration);
    return scratch.acceleration;
}

export function computeAirAcceleration(
    physics: Pick<HoverPhysicsParams, 'gravity' | 'airDrag'>,
    velocity: THREE.Vector3,
    out: THREE.Vector3,
) {
    out.set(0, -physics.gravity, 0);
    if (physics.airDrag > 0 && velocity.lengthSq() > 1e-8) {
        out.addScaledVector(velocity, -physics.airDrag);
    }
    return out;
}

export function applyJumpVelocity(
    velocity: THREE.Vector3,
    normal: THREE.Vector3,
    jumpSpeed: number,
    tangentOut: THREE.Vector3,
) {
    projectOntoPlane(velocity, normal, tangentOut);
    velocity.copy(tangentOut).addScaledVector(normal, jumpSpeed);
}

export function removeInwardNormalVelocity(
    velocity: THREE.Vector3,
    normal: THREE.Vector3,
) {
    const velAlongNormal = velocity.dot(normal);
    if (velAlongNormal < 0) {
        velocity.addScaledVector(normal, -velAlongNormal);
    }
}

export function isHoverEngaged(
    heightAbove: number,
    maxHoverRange: number,
) {
    return heightAbove <= maxHoverRange;
}

export function canReengageHover(
    heightAbove: number,
    maxHoverRange: number,
    velAlongNormal: number,
    landingVelThreshold = 0.12,
) {
    return heightAbove <= maxHoverRange && velAlongNormal <= landingVelThreshold;
}

export function lostHoverContact(
    heightAbove: number,
    maxHoverRange: number,
    margin = 0.08,
) {
    return heightAbove > maxHoverRange + margin;
}

export function resolveHoverPenetration(
    heightAbove: number,
    hoverClearance: number,
    position: THREE.Vector3,
    velocity: THREE.Vector3,
    normal: THREE.Vector3,
) {
    if (heightAbove >= hoverClearance) return;
    position.addScaledVector(normal, hoverClearance - heightAbove);
    removeInwardNormalVelocity(velocity, normal);
}

export function projectVelocityOntoTangentPlane(
    velocity: THREE.Vector3,
    normal: THREE.Vector3,
    scratch: THREE.Vector3,
) {
    projectOntoPlane(velocity, normal, scratch);
    velocity.copy(scratch);
}

export function integrateVelocity(
    velocity: THREE.Vector3,
    acceleration: THREE.Vector3,
    frameScale: number,
) {
    velocity.addScaledVector(acceleration, frameScale);
}

export function getSpeedRatio(
    physics: Pick<PhysicsState, 'maxSpeed' | 'boostMultiplier'>,
    speed: number,
) {
    const hudFastSpeed = physics.maxSpeed * physics.boostMultiplier;
    if (hudFastSpeed <= 0) return 0;
    return Math.min(Math.abs(speed) / hudFastSpeed, 1);
}
