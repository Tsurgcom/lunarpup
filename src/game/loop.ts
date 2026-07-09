import * as THREE from 'three';
import {
    renderer,
    camera,
    scene,
    playerGroup,
    physics,
    keys,
    jumpInput,
    cameraControl,
    scratch,
    skateboard,
    tail,
    multiplayerClient,
} from '../state.ts';
import { groundClearance } from '../config.ts';
import {
    getTerrainNormal,
    getHeightAboveTerrain,
    getRenderedTerrainChunkCount,
    updateTerrainChunks,
    alignPlayerToTerrain,
} from './terrain.ts';
import { updateSpeedLines } from '../ui/speedLines.ts';
import { updateMinimap } from '../ui/minimap.ts';
import { updateRemotePlayers } from './remotePlayers.ts';
import { buildLocalSnapshot } from './multiplayer.ts';
import { finishTrick, startTrick, updateTrick } from './tricks.ts';

export function setupCameraControls() {
    const canvas = renderer.domElement;

    const preventContextMenu = (event: MouseEvent) => event.preventDefault();

    const onPointerDown = (event: PointerEvent) => {
        cameraControl.isDragging = true;
        cameraControl.lastX = event.clientX;
        cameraControl.lastY = event.clientY;
        canvas.setPointerCapture(event.pointerId);
    };

    const onPointerMove = (event: PointerEvent) => {
        if (!cameraControl.isDragging) return;

        const dx = event.clientX - cameraControl.lastX;
        const dy = event.clientY - cameraControl.lastY;
        cameraControl.lastX = event.clientX;
        cameraControl.lastY = event.clientY;

        cameraControl.yaw += dx * cameraControl.sensitivity;
        cameraControl.pitch = THREE.MathUtils.clamp(
            cameraControl.pitch - dy * cameraControl.sensitivity,
            -0.2,
            1.25,
        );
    };

    function stopDragging(event?: PointerEvent) {
        cameraControl.isDragging = false;
        if (event && canvas.hasPointerCapture(event.pointerId)) {
            canvas.releasePointerCapture(event.pointerId);
        }
    }

    const onWheel = (event: WheelEvent) => {
        event.preventDefault();
        const zoomMultiplier = 1 + event.deltaY * cameraControl.zoomSensitivity;
        cameraControl.distance = THREE.MathUtils.clamp(
            cameraControl.distance * zoomMultiplier,
            cameraControl.minDistance,
            cameraControl.maxDistance,
        );
    };

    canvas.addEventListener('contextmenu', preventContextMenu);
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', stopDragging);
    canvas.addEventListener('pointercancel', stopDragging);
    canvas.addEventListener('pointerleave', stopDragging);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    return () => {
        canvas.removeEventListener('contextmenu', preventContextMenu);
        canvas.removeEventListener('pointerdown', onPointerDown);
        canvas.removeEventListener('pointermove', onPointerMove);
        canvas.removeEventListener('pointerup', stopDragging);
        canvas.removeEventListener('pointercancel', stopDragging);
        canvas.removeEventListener('pointerleave', stopDragging);
        canvas.removeEventListener('wheel', onWheel);
    };
}

function lerpAngle(a: number, b: number, t: number) {
    const delta = Math.atan2(Math.sin(b - a), Math.cos(b - a));
    return a + delta * t;
}

export function updateCamera(dt: number) {
    const frameScale = dt * 60;
    if (!cameraControl.isDragging && Math.abs(physics.speed) > 0.03) {
        const followStrength = 1 - Math.pow(1 - cameraControl.autoFollowStrength, frameScale);
        cameraControl.yaw = lerpAngle(cameraControl.yaw, physics.heading + Math.PI, followStrength);
    }

    const horizontalDistance = Math.cos(cameraControl.pitch) * cameraControl.distance;
    const verticalDistance = Math.sin(cameraControl.pitch) * cameraControl.distance;

    scratch.camOffset.set(
        Math.sin(cameraControl.yaw) * horizontalDistance,
        verticalDistance + 2.0,
        Math.cos(cameraControl.yaw) * horizontalDistance,
    );

    scratch.targetCamPos.copy(playerGroup.position).add(scratch.camOffset);

    const baseCameraLerp = keys.shift && keys.w ? 0.16 : 0.10;
    const cameraLerp = 1 - Math.pow(1 - baseCameraLerp, frameScale);
    camera.position.lerp(scratch.targetCamPos, cameraLerp);

    scratch.lookTarget.copy(playerGroup.position);
    scratch.lookTarget.y += 1.4;
    camera.lookAt(scratch.lookTarget);

    const speedRatio = THREE.MathUtils.clamp(Math.abs(physics.speed) / (physics.maxSpeed * physics.boostMultiplier), 0, 1);
    const targetFov = THREE.MathUtils.lerp(physics.cameraBaseFov, physics.cameraMaxFov, Math.pow(speedRatio, 1.35));
    const fovSmoothing = 1 - Math.pow(1 - cameraControl.fovSmoothing, frameScale);
    camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, fovSmoothing);
    camera.updateProjectionMatrix();
}

function tiltBoardToTerrain(frameScale: number) {
    if (!physics.isGrounded) return;
    const speedLean = THREE.MathUtils.clamp(physics.speed / (physics.maxSpeed * physics.boostMultiplier), -1, 1);
    const turnLean = (keys.a ? 1 : 0) + (keys.d ? -1 : 0);
    const tiltSmoothing = 1 - Math.pow(1 - physics.tiltSmoothing, frameScale);
    skateboard.rotation.x = THREE.MathUtils.lerp(skateboard.rotation.x, -speedLean * 0.05, tiltSmoothing);
    skateboard.rotation.z = THREE.MathUtils.lerp(skateboard.rotation.z, turnLean * 0.12, tiltSmoothing);
}

const JUMP_BUFFER_MS = 150;
const COYOTE_TIME_MS = 100;

function wantsJump(now: number) {
    if (keys.space) return true;
    return jumpInput.queuedAt > 0 && now - jumpInput.queuedAt <= JUMP_BUFFER_MS;
}

function consumeJumpRequest() {
    jumpInput.queuedAt = 0;
}

function canCoyoteJump() {
    return !physics.isGrounded && physics.airTime * 1000 <= COYOTE_TIME_MS;
}

function applyJump() {
    const normal = getTerrainNormal(playerGroup.position.x, playerGroup.position.z);
    physics.velocity.copy(normal).multiplyScalar(physics.jumpForce);
    physics.isGrounded = false;
    physics.airTime = 0;
    consumeJumpRequest();
    startTrick();
}

function ensureGroundClearance() {
    const { x, y, z } = playerGroup.position;
    const heightAbove = getHeightAboveTerrain(x, y, z);
    if (heightAbove < groundClearance) {
        const normal = getTerrainNormal(x, z);
        playerGroup.position.addScaledVector(normal, groundClearance - heightAbove);
    }
}

function applySuspension(frameScale: number) {
    const { x, y, z } = playerGroup.position;
    const heightAbove = getHeightAboveTerrain(x, y, z);
    const heightDelta = groundClearance - heightAbove;
    if (Math.abs(heightDelta) < 1e-6) return;

    const normal = getTerrainNormal(x, z);
    if (heightAbove < groundClearance || Math.abs(heightDelta) > 18) {
        playerGroup.position.addScaledVector(normal, heightDelta);
        return;
    }

    const suspensionBlend = 1 - Math.pow(1 - physics.suspension, frameScale);
    playerGroup.position.addScaledVector(normal, heightDelta * suspensionBlend);
}

function handlePhysics(dt: number) {
    const frameScale = dt * 60;
    if (keys.a) physics.heading += physics.rotationSpeed * frameScale;
    if (keys.d) physics.heading -= physics.rotationSpeed * frameScale;

    const isBoosting = keys.shift && keys.w;
    const currentMaxSpeed = physics.maxSpeed * (isBoosting ? physics.boostMultiplier : 1);
    const currentAccel = physics.accel * (isBoosting ? physics.boostAccelMultiplier : 1);

    if (keys.w) {
        physics.speed += currentAccel * frameScale;
        if (physics.speed > currentMaxSpeed) physics.speed = currentMaxSpeed;
    } else if (keys.s) {
        physics.speed -= physics.accel * frameScale;
        if (physics.speed < -physics.maxSpeed / 2) physics.speed = -physics.maxSpeed / 2;
    } else {
        if (physics.speed > 0) physics.speed = Math.max(0, physics.speed - physics.decel * frameScale);
        if (physics.speed < 0) physics.speed = Math.min(0, physics.speed + physics.decel * frameScale);
    }

    const now = performance.now();

    if (physics.isGrounded) {
        if (wantsJump(now)) {
            ensureGroundClearance();
            applyJump();
        } else {
            applySuspension(frameScale);
            physics.velocity.set(0, 0, 0);
        }
    } else {
        physics.airTime += dt;
        if (wantsJump(now) && canCoyoteJump()) {
            applyJump();
        }
    }

    if (!physics.isGrounded) {
        physics.velocity.y -= physics.gravity * frameScale;
        playerGroup.position.addScaledVector(physics.velocity, frameScale);

        const { x, y, z } = playerGroup.position;
        const normal = getTerrainNormal(x, z);
        const heightAbove = getHeightAboveTerrain(x, y, z);
        const velAlongNormal = physics.velocity.dot(normal);

        if (heightAbove <= groundClearance && velAlongNormal <= 0) {
            if (wantsJump(now)) {
                ensureGroundClearance();
                applyJump();
            } else {
                playerGroup.position.addScaledVector(normal, groundClearance - heightAbove);
                physics.isGrounded = true;
                physics.velocity.set(0, 0, 0);
                finishTrick();
            }
        }
    }

    scratch.forwardVector.set(Math.sin(physics.heading), 0, Math.cos(physics.heading));
    playerGroup.position.addScaledVector(scratch.forwardVector, physics.speed * frameScale);

    if (physics.isGrounded) {
        applySuspension(frameScale);
        physics.velocity.set(0, 0, 0);
    }

    updateTerrainChunks();
    alignPlayerToTerrain(frameScale);
    tiltBoardToTerrain(frameScale);

    const speedRatio = THREE.MathUtils.clamp(Math.abs(physics.speed) / (physics.maxSpeed * physics.boostMultiplier), 0, 1);
    updateSpeedLines(speedRatio, isBoosting);
    const speedometer = document.getElementById('speedometer');
    if (speedometer) {
        speedometer.innerText = `${(Math.abs(physics.speed) * 80).toFixed(1)} U/S${isBoosting ? '  BOOST' : ''}  | chunks ${getRenderedTerrainChunkCount()}`;
    }
}

export function stepGameFrame(dt = 1 / 60, options: { updateCamera?: boolean } = {}) {
    updateTrick(dt);
    handlePhysics(dt);
    if (options.updateCamera ?? true) updateCamera(dt);
    updateRemotePlayers(dt);
    updateMinimap();

    if (multiplayerClient?.isConnected) {
        multiplayerClient.sendState(buildLocalSnapshot(
            playerGroup,
            physics.heading,
            physics.speed,
            physics.isGrounded,
            skateboard.rotation.x,
            skateboard.rotation.z,
        ));
    }

    if (Math.abs(physics.speed) > 0.05) {
        const time = Date.now() * 0.015;
        if (tail) tail.rotation.z = Math.sin(time) * 0.4;
        for (let i = 1; i < skateboard.children.length; i++) {
            skateboard.children[i]!.rotation.x += physics.speed * 2 * dt * 60;
        }
    }
}

export function startGameLoop(options: { externalRenderLoop?: boolean } = {}) {
    if (options.externalRenderLoop) return;
    let lastFrame = performance.now();

    function animate() {
        requestAnimationFrame(animate);
        const now = performance.now();
        const dt = Math.min((now - lastFrame) / 1000, 0.05);
        lastFrame = now;

        stepGameFrame(dt);
        renderer.render(scene, camera);
    }

    animate();
}
