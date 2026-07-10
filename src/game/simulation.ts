import * as THREE from 'three';
import { hoverClearance } from '../config.ts';
import {
    getTerrainNormal,
    getHeightAboveTerrain,
    getRenderedTerrainChunkCount,
    alignPlayerToTerrain,
    getTerrainHeight,
} from './terrain.ts';
import { buildLocalSnapshot } from './multiplayer.ts';
import { finishTrick, startTrick, updateTrick } from './tricks.ts';
import {
    applyJumpVelocity,
    canCoyoteJump,
    canReengageHover,
    computeAirAcceleration,
    computeHoverAcceleration,
    consumeJumpRequest,
    getGroundSpeed,
    getHeadingForward,
    getHoverPadPulse,
    getSlopeForward,
    getSpeedRatio,
    integrateVelocity,
    isHoverEngaged,
    lostHoverContact,
    removeInwardNormalVelocity,
    resolveHoverPenetration,
    stepHeading,
    wantsJump,
} from './playerPhysics.ts';
import type { GameRuntime } from './types.ts';
import { getPlayerRoot } from './runtime.ts';

function tiltBoardToTerrain(runtime: GameRuntime, groundSpeed: number, frameScale: number) {
    const { physics, keys, parts } = runtime;
    if (!parts || !physics.isGrounded) return;

    const speedLean = THREE.MathUtils.clamp(
        groundSpeed / (physics.maxSpeed * physics.boostMultiplier),
        -1,
        1,
    );
    const turnLean = (keys.a ? 1 : 0) + (keys.d ? -1 : 0);
    const tiltSmoothing = 1 - Math.pow(1 - physics.tiltSmoothing, frameScale);
    parts.skateboard.rotation.x = THREE.MathUtils.lerp(parts.skateboard.rotation.x, -speedLean * 0.08, tiltSmoothing);
    parts.skateboard.rotation.z = THREE.MathUtils.lerp(parts.skateboard.rotation.z, turnLean * 0.14, tiltSmoothing);
}

function applyJump(runtime: GameRuntime) {
    const playerGroup = getPlayerRoot(runtime);
    if (!playerGroup) return;

    const { physics, jumpInput, scratch } = runtime;
    const normal = getTerrainNormal(playerGroup.position.x, playerGroup.position.z, scratch);
    applyJumpVelocity(physics.velocity, normal, physics.jumpImpulse, scratch.tangentVelocity);
    physics.isGrounded = false;
    physics.airTime = 0;
    consumeJumpRequest(jumpInput);
    startTrick(runtime);
}

function sampleGroundContact(
    position: THREE.Vector3,
    velocity: THREE.Vector3,
    scratch: GameRuntime['scratch'],
) {
    const { x, y, z } = position;
    const normal = getTerrainNormal(x, z, scratch);
    const heightAbove = getHeightAboveTerrain(x, y, z, scratch);
    const velAlongNormal = velocity.dot(normal);
    return { normal, heightAbove, velAlongNormal };
}

function updateTravelForward(
    physics: GameRuntime['physics'],
    position: THREE.Vector3,
    scratch: GameRuntime['scratch'],
) {
    const normal = getTerrainNormal(position.x, position.z, scratch);
    if (physics.isGrounded) {
        getSlopeForward(physics.heading, normal, scratch);
    } else {
        getHeadingForward(physics.heading, scratch.slopeForward);
    }
}

function handleJumpIntent(
    runtime: GameRuntime,
    playerGroup: THREE.Group,
    now: number,
    dt: number,
) {
    const { physics, jumpInput, scratch } = runtime;

    if (physics.isGrounded) {
        if (!wantsJump(jumpInput, now)) return;

        const contact = sampleGroundContact(playerGroup.position, physics.velocity, scratch);
        resolveHoverPenetration(
            contact.heightAbove,
            hoverClearance,
            playerGroup.position,
            physics.velocity,
            contact.normal,
        );
        applyJump(runtime);
        return;
    }

    physics.airTime += dt;
    if (wantsJump(jumpInput, now) && canCoyoteJump(physics.isGrounded, physics.airTime)) {
        applyJump(runtime);
    }
}

function stepAirborne(
    runtime: GameRuntime,
    playerGroup: THREE.Group,
    driveInput: { forward: boolean; reverse: boolean; boosting: boolean },
    frameScale: number,
    now: number,
) {
    const { physics, jumpInput, scratch } = runtime;

    computeAirAcceleration(physics, physics.velocity, scratch.acceleration);
    integrateVelocity(physics.velocity, scratch.acceleration, frameScale);
    playerGroup.position.addScaledVector(physics.velocity, frameScale);

    const contact = sampleGroundContact(playerGroup.position, physics.velocity, scratch);
    if (!canReengageHover(contact.heightAbove, physics.maxHoverRange, contact.velAlongNormal)) {
        return;
    }

    if (wantsJump(jumpInput, now)) {
        applyJump(runtime);
        return;
    }

    physics.isGrounded = true;
    finishTrick(runtime);

    computeHoverAcceleration(
        physics,
        physics.velocity,
        driveInput,
        contact.normal,
        scratch.slopeForward,
        contact.heightAbove,
        hoverClearance,
        scratch,
    );
    integrateVelocity(physics.velocity, scratch.acceleration, frameScale);
    playerGroup.position.addScaledVector(physics.velocity, frameScale);

    const landed = sampleGroundContact(playerGroup.position, physics.velocity, scratch);
    resolveHoverPenetration(
        landed.heightAbove,
        hoverClearance,
        playerGroup.position,
        physics.velocity,
        landed.normal,
    );
}

function stepHovering(
    runtime: GameRuntime,
    playerGroup: THREE.Group,
    driveInput: { forward: boolean; reverse: boolean; boosting: boolean },
    frameScale: number,
) {
    const { physics, scratch } = runtime;
    const contact = sampleGroundContact(playerGroup.position, physics.velocity, scratch);

    if (lostHoverContact(contact.heightAbove, physics.maxHoverRange)) {
        physics.isGrounded = false;
        return;
    }

    computeHoverAcceleration(
        physics,
        physics.velocity,
        driveInput,
        contact.normal,
        scratch.slopeForward,
        contact.heightAbove,
        hoverClearance,
        scratch,
    );
    integrateVelocity(physics.velocity, scratch.acceleration, frameScale);
    playerGroup.position.addScaledVector(physics.velocity, frameScale);

    const updated = sampleGroundContact(playerGroup.position, physics.velocity, scratch);
    if (!isHoverEngaged(updated.heightAbove, physics.maxHoverRange)) {
        physics.isGrounded = false;
        return;
    }

    resolveHoverPenetration(
        updated.heightAbove,
        hoverClearance,
        playerGroup.position,
        physics.velocity,
        updated.normal,
    );
    removeInwardNormalVelocity(physics.velocity, updated.normal);
}

function animateHoverPads(
    parts: NonNullable<GameRuntime['parts']>,
    hoverPulse: number,
    isGrounded: boolean,
    frameScale: number,
) {
    const pulseStrength = isGrounded ? Math.min(Math.abs(hoverPulse) * 1.6, 1.4) : 0.15;
    const time = Date.now() * 0.012;
    for (const child of parts.skateboard.children) {
        if (child.userData.hoverPad !== true) continue;
        const phase = child.userData.hoverPhase ?? 0;
        const bob = 1 + Math.sin(time + phase) * 0.08 * (0.35 + pulseStrength);
        child.scale.y = bob;
        const material = (child as THREE.Mesh).material;
        if (material instanceof THREE.MeshStandardMaterial) {
            material.emissiveIntensity = isGrounded ? 0.35 + pulseStrength * 0.45 : 0.08;
        }
        child.rotation.y += hoverPulse * 0.35 * frameScale;
    }
}

function handlePhysics(runtime: GameRuntime, dt: number): { groundSpeed: number; hoverPulse: number } {
    const playerGroup = getPlayerRoot(runtime);
    if (!playerGroup || !runtime.parts) return { groundSpeed: 0, hoverPulse: 0 };

    const { physics, keys, scratch, frameHud } = runtime;
    const frameScale = dt * 60;
    physics.heading = stepHeading(physics.heading, physics.rotationSpeed, keys.a, keys.d, frameScale);

    const isBoosting = keys.shift && keys.w;
    const driveInput = { forward: keys.w, reverse: keys.s, boosting: isBoosting };
    const now = performance.now();

    updateTravelForward(physics, playerGroup.position, scratch);
    handleJumpIntent(runtime, playerGroup, now, dt);

    if (!physics.isGrounded) {
        stepAirborne(runtime, playerGroup, driveInput, frameScale, now);
    } else {
        stepHovering(runtime, playerGroup, driveInput, frameScale);
    }

    const displaySpeed = getGroundSpeed(physics.velocity, scratch.slopeForward);
    const contact = sampleGroundContact(playerGroup.position, physics.velocity, scratch);
    const hoverPulse = physics.isGrounded
        ? getHoverPadPulse(physics.velocity, contact.normal, scratch.slopeForward, scratch.tangentVelocity)
        : 0;

    if (physics.isGrounded) {
        alignPlayerToTerrain(playerGroup, physics, scratch, frameScale);
        tiltBoardToTerrain(runtime, displaySpeed, frameScale);
    }

    const speedRatio = getSpeedRatio(physics, displaySpeed);
    frameHud.setSpeedText?.(
        `${(Math.abs(displaySpeed) * 80).toFixed(1)} U/S${isBoosting ? '  BOOST' : ''}  | chunks ${getRenderedTerrainChunkCount()}`,
    );
    frameHud.updateSpeedLines?.(speedRatio, isBoosting);
    frameHud.redrawMinimap?.();

    return { groundSpeed: displaySpeed, hoverPulse };
}

export function stepSimulation(runtime: GameRuntime, dt: number) {
    if (!runtime.parts) return;

    updateTrick(runtime, dt);
    const { groundSpeed, hoverPulse } = handlePhysics(runtime, dt);

    if (runtime.multiplayerClient?.isConnected) {
        const playerGroup = getPlayerRoot(runtime)!;
        runtime.multiplayerClient.sendState(buildLocalSnapshot(
            playerGroup,
            runtime.physics.heading,
            groundSpeed,
            runtime.physics.isGrounded,
            runtime.parts.skateboard.rotation.x,
            runtime.parts.skateboard.rotation.z,
        ));
    }

    const { parts } = runtime;
    const frameScale = dt * 60;
    if (Math.abs(hoverPulse) > 0.03 || runtime.physics.isGrounded) {
        const time = Date.now() * 0.015;
        parts.tail.rotation.z = Math.sin(time) * 0.4;
        animateHoverPads(parts, hoverPulse, runtime.physics.isGrounded, frameScale);
    }
}

export function teleportPlayer(runtime: GameRuntime, x: number, z: number) {
    const playerGroup = getPlayerRoot(runtime);
    if (!playerGroup) return;

    const { physics, scratch } = runtime;
    playerGroup.position.x = x;
    playerGroup.position.z = z;
    playerGroup.position.y = getTerrainHeight(x, z) + hoverClearance;
    physics.velocity.set(0, 0, 0);
    physics.isGrounded = true;
    alignPlayerToTerrain(playerGroup, physics, scratch);
}
