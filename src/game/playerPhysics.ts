export const JUMP_BUFFER_MS = 150;
export const COYOTE_TIME_MS = 100;

export interface JumpInput {
    spaceHeld: boolean;
    queuedAt: number;
}

export interface DrivePhysics {
    speed: number;
    maxSpeed: number;
    accel: number;
    decel: number;
    boostMultiplier: number;
    boostAccelMultiplier: number;
}

export interface DriveInput {
    forward: boolean;
    reverse: boolean;
    boosting: boolean;
}

export function wantsJump(input: JumpInput, now: number) {
    if (input.spaceHeld) return true;
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

export function stepDriveSpeed(physics: DrivePhysics, input: DriveInput, frameScale: number) {
    const currentMaxSpeed = physics.maxSpeed * (input.boosting ? physics.boostMultiplier : 1);
    const currentAccel = physics.accel * (input.boosting ? physics.boostAccelMultiplier : 1);

    if (input.forward) {
        physics.speed += currentAccel * frameScale;
        if (physics.speed > currentMaxSpeed) physics.speed = currentMaxSpeed;
        return;
    }

    if (input.reverse) {
        physics.speed -= physics.accel * frameScale;
        if (physics.speed < -physics.maxSpeed / 2) physics.speed = -physics.maxSpeed / 2;
        return;
    }

    if (physics.speed > 0) physics.speed = Math.max(0, physics.speed - physics.decel * frameScale);
    if (physics.speed < 0) physics.speed = Math.min(0, physics.speed + physics.decel * frameScale);
}

export function blendSuspensionOffset(heightDelta: number, suspension: number, frameScale: number) {
    const suspensionBlend = 1 - Math.pow(1 - suspension, frameScale);
    return heightDelta * suspensionBlend;
}

export function shouldSnapToGround(
    heightAbove: number,
    heightDelta: number,
    groundClearance: number,
    snapThreshold = 18,
) {
    return heightAbove < groundClearance || Math.abs(heightDelta) > snapThreshold;
}
