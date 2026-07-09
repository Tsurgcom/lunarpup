import * as THREE from 'three';
import { groundClearance } from '../config.ts';
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
    blendSuspensionOffset,
    canCoyoteJump,
    consumeJumpRequest,
    shouldSnapToGround,
    stepDriveSpeed,
    stepHeading,
    wantsJump,
} from './playerPhysics.ts';
import type { GameRuntime } from './types.ts';
import { getPlayerRoot } from './runtime.ts';

function tiltBoardToTerrain(runtime: GameRuntime, frameScale: number) {
    const { physics, keys, parts } = runtime;
    if (!parts || !physics.isGrounded) return;

    const speedLean = THREE.MathUtils.clamp(physics.speed / (physics.maxSpeed * physics.boostMultiplier), -1, 1);
    const turnLean = (keys.a ? 1 : 0) + (keys.d ? -1 : 0);
    const tiltSmoothing = 1 - Math.pow(1 - physics.tiltSmoothing, frameScale);
    parts.skateboard.rotation.x = THREE.MathUtils.lerp(parts.skateboard.rotation.x, -speedLean * 0.05, tiltSmoothing);
    parts.skateboard.rotation.z = THREE.MathUtils.lerp(parts.skateboard.rotation.z, turnLean * 0.12, tiltSmoothing);
}

function applyJump(runtime: GameRuntime) {
    const playerGroup = getPlayerRoot(runtime);
    if (!playerGroup) return;

    const { physics, jumpInput, scratch } = runtime;
    const normal = getTerrainNormal(playerGroup.position.x, playerGroup.position.z, scratch);
    physics.velocity.copy(normal).multiplyScalar(physics.jumpForce);
    physics.isGrounded = false;
    physics.airTime = 0;
    consumeJumpRequest(jumpInput);
    startTrick(runtime);
}

function ensureGroundClearance(runtime: GameRuntime) {
    const playerGroup = getPlayerRoot(runtime);
    if (!playerGroup) return;

    const { x, y, z } = playerGroup.position;
    const heightAbove = getHeightAboveTerrain(x, y, z, runtime.scratch);
    if (heightAbove < groundClearance) {
        const normal = getTerrainNormal(x, z, runtime.scratch);
        playerGroup.position.addScaledVector(normal, groundClearance - heightAbove);
    }
}

function applySuspension(runtime: GameRuntime, frameScale: number) {
    const playerGroup = getPlayerRoot(runtime);
    if (!playerGroup) return;

    const { physics, scratch } = runtime;
    const { x, y, z } = playerGroup.position;
    const heightAbove = getHeightAboveTerrain(x, y, z, scratch);
    const heightDelta = groundClearance - heightAbove;
    if (Math.abs(heightDelta) < 1e-6) return;

    const normal = getTerrainNormal(x, z, scratch);
    if (shouldSnapToGround(heightAbove, heightDelta, groundClearance)) {
        playerGroup.position.addScaledVector(normal, heightDelta);
        return;
    }

    playerGroup.position.addScaledVector(
        normal,
        blendSuspensionOffset(heightDelta, physics.suspension, frameScale),
    );
}

function handlePhysics(runtime: GameRuntime, dt: number) {
    const playerGroup = getPlayerRoot(runtime);
    if (!playerGroup || !runtime.parts) return;

    const { physics, keys, jumpInput, scratch, frameHud } = runtime;
    const frameScale = dt * 60;
    physics.heading = stepHeading(physics.heading, physics.rotationSpeed, keys.a, keys.d, frameScale);

    const isBoosting = keys.shift && keys.w;
    stepDriveSpeed(physics, {
        forward: keys.w,
        reverse: keys.s,
        boosting: isBoosting,
    }, frameScale);

    const now = performance.now();

    if (physics.isGrounded) {
        if (wantsJump({ spaceHeld: keys.space, queuedAt: jumpInput.queuedAt }, now)) {
            ensureGroundClearance(runtime);
            applyJump(runtime);
        } else {
            applySuspension(runtime, frameScale);
            physics.velocity.set(0, 0, 0);
        }
    } else {
        physics.airTime += dt;
        if (wantsJump({ spaceHeld: keys.space, queuedAt: jumpInput.queuedAt }, now)
            && canCoyoteJump(physics.isGrounded, physics.airTime)) {
            applyJump(runtime);
        }
    }

    if (!physics.isGrounded) {
        physics.velocity.y -= physics.gravity * frameScale;
        playerGroup.position.addScaledVector(physics.velocity, frameScale);

        const { x, y, z } = playerGroup.position;
        const normal = getTerrainNormal(x, z, scratch);
        const heightAbove = getHeightAboveTerrain(x, y, z, scratch);
        const velAlongNormal = physics.velocity.dot(normal);

        if (heightAbove <= groundClearance && velAlongNormal <= 0) {
            if (wantsJump({ spaceHeld: keys.space, queuedAt: jumpInput.queuedAt }, now)) {
                ensureGroundClearance(runtime);
                applyJump(runtime);
            } else {
                playerGroup.position.addScaledVector(normal, groundClearance - heightAbove);
                physics.isGrounded = true;
                physics.velocity.set(0, 0, 0);
                finishTrick(runtime);
            }
        }
    }

    scratch.forwardVector.set(Math.sin(physics.heading), 0, Math.cos(physics.heading));
    playerGroup.position.addScaledVector(scratch.forwardVector, physics.speed * frameScale);

    if (physics.isGrounded) {
        applySuspension(runtime, frameScale);
        physics.velocity.set(0, 0, 0);
    }

    alignPlayerToTerrain(playerGroup, physics, scratch, frameScale);
    tiltBoardToTerrain(runtime, frameScale);

    const speedRatio = THREE.MathUtils.clamp(Math.abs(physics.speed) / (physics.maxSpeed * physics.boostMultiplier), 0, 1);
    frameHud.setSpeedText?.(`${(Math.abs(physics.speed) * 80).toFixed(1)} U/S${isBoosting ? '  BOOST' : ''}  | chunks ${getRenderedTerrainChunkCount()}`);
    frameHud.updateSpeedLines?.(speedRatio, isBoosting);
    frameHud.redrawMinimap?.();
}

export function stepSimulation(runtime: GameRuntime, dt: number) {
    if (!runtime.parts) return;

    updateTrick(runtime, dt);
    handlePhysics(runtime, dt);

    if (runtime.multiplayerClient?.isConnected) {
        const playerGroup = getPlayerRoot(runtime)!;
        runtime.multiplayerClient.sendState(buildLocalSnapshot(
            playerGroup,
            runtime.physics.heading,
            runtime.physics.speed,
            runtime.physics.isGrounded,
            runtime.parts.skateboard.rotation.x,
            runtime.parts.skateboard.rotation.z,
        ));
    }

    const { physics, parts } = runtime;
    if (Math.abs(physics.speed) > 0.05) {
        const time = Date.now() * 0.015;
        parts.tail.rotation.z = Math.sin(time) * 0.4;
        for (let i = 1; i < parts.skateboard.children.length; i++) {
            parts.skateboard.children[i]!.rotation.x += physics.speed * 2 * dt * 60;
        }
    }
}

export function teleportPlayer(runtime: GameRuntime, x: number, z: number) {
    const playerGroup = getPlayerRoot(runtime);
    if (!playerGroup) return;

    const { physics, scratch } = runtime;
    playerGroup.position.x = x;
    playerGroup.position.z = z;
    playerGroup.position.y = getTerrainHeight(x, z) + groundClearance;
    physics.velocity.set(0, 0, 0);
    physics.isGrounded = true;
    physics.speed = 0;
    alignPlayerToTerrain(playerGroup, physics, scratch);
}
