import * as THREE from 'three';
import {
    renderer,
    camera,
    scene,
    playerGroup,
    physics,
    keys,
    cameraControl,
    scratch,
    terrainChunks,
    skateboard,
    tail,
} from '../state.ts';
import { groundClearance } from '../config.ts';
import {
    getTerrainHeight,
    updateTerrainChunks,
    alignPlayerToTerrain,
} from './terrain.ts';
import { updateSpeedLines } from '../ui/speedLines.ts';

export function setupCameraControls() {
    const canvas = renderer.domElement;

    canvas.addEventListener('contextmenu', (event) => event.preventDefault());

    canvas.addEventListener('pointerdown', (event) => {
        cameraControl.isDragging = true;
        cameraControl.lastX = event.clientX;
        cameraControl.lastY = event.clientY;
        canvas.setPointerCapture(event.pointerId);
    });

    canvas.addEventListener('pointermove', (event) => {
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
    });

    function stopDragging(event?: PointerEvent) {
        cameraControl.isDragging = false;
        if (event && canvas.hasPointerCapture(event.pointerId)) {
            canvas.releasePointerCapture(event.pointerId);
        }
    }

    canvas.addEventListener('pointerup', stopDragging);
    canvas.addEventListener('pointercancel', stopDragging);
    canvas.addEventListener('pointerleave', stopDragging);

    canvas.addEventListener('wheel', (event) => {
        event.preventDefault();
        const zoomMultiplier = 1 + event.deltaY * cameraControl.zoomSensitivity;
        cameraControl.distance = THREE.MathUtils.clamp(
            cameraControl.distance * zoomMultiplier,
            cameraControl.minDistance,
            cameraControl.maxDistance,
        );
    }, { passive: false });
}

function lerpAngle(a: number, b: number, t: number) {
    const delta = Math.atan2(Math.sin(b - a), Math.cos(b - a));
    return a + delta * t;
}

function updateCamera() {
    if (!cameraControl.isDragging && Math.abs(physics.speed) > 0.03) {
        cameraControl.yaw = lerpAngle(cameraControl.yaw, physics.heading + Math.PI, cameraControl.autoFollowStrength);
    }

    const horizontalDistance = Math.cos(cameraControl.pitch) * cameraControl.distance;
    const verticalDistance = Math.sin(cameraControl.pitch) * cameraControl.distance;

    scratch.camOffset.set(
        Math.sin(cameraControl.yaw) * horizontalDistance,
        verticalDistance + 2.0,
        Math.cos(cameraControl.yaw) * horizontalDistance,
    );

    scratch.targetCamPos.copy(playerGroup.position).add(scratch.camOffset);

    const cameraLerp = keys.shift && keys.w ? 0.16 : 0.10;
    camera.position.lerp(scratch.targetCamPos, cameraLerp);

    scratch.lookTarget.copy(playerGroup.position);
    scratch.lookTarget.y += 1.4;
    camera.lookAt(scratch.lookTarget);

    const speedRatio = THREE.MathUtils.clamp(Math.abs(physics.speed) / (physics.maxSpeed * physics.boostMultiplier), 0, 1);
    const targetFov = THREE.MathUtils.lerp(physics.cameraBaseFov, physics.cameraMaxFov, Math.pow(speedRatio, 1.35));
    camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, cameraControl.fovSmoothing);
    camera.updateProjectionMatrix();
}

function tiltBoardToTerrain() {
    if (!physics.isGrounded) return;
    const speedLean = THREE.MathUtils.clamp(physics.speed / (physics.maxSpeed * physics.boostMultiplier), -1, 1);
    const turnLean = (keys.a ? 1 : 0) + (keys.d ? -1 : 0);
    skateboard.rotation.x = THREE.MathUtils.lerp(skateboard.rotation.x, -speedLean * 0.05, physics.tiltSmoothing);
    skateboard.rotation.z = THREE.MathUtils.lerp(skateboard.rotation.z, turnLean * 0.12, physics.tiltSmoothing);
}

function handlePhysics() {
    if (keys.a) physics.heading += physics.rotationSpeed;
    if (keys.d) physics.heading -= physics.rotationSpeed;

    const isBoosting = keys.shift && keys.w;
    const currentMaxSpeed = physics.maxSpeed * (isBoosting ? physics.boostMultiplier : 1);
    const currentAccel = physics.accel * (isBoosting ? physics.boostAccelMultiplier : 1);

    if (keys.w) {
        physics.speed += currentAccel;
        if (physics.speed > currentMaxSpeed) physics.speed = currentMaxSpeed;
    } else if (keys.s) {
        physics.speed -= physics.accel;
        if (physics.speed < -physics.maxSpeed / 2) physics.speed = -physics.maxSpeed / 2;
    } else {
        if (physics.speed > 0) physics.speed = Math.max(0, physics.speed - physics.decel);
        if (physics.speed < 0) physics.speed = Math.min(0, physics.speed + physics.decel);
    }

    const targetY = getTerrainHeight(playerGroup.position.x, playerGroup.position.z) + groundClearance;
    if (physics.isGrounded) {
        const heightDelta = targetY - playerGroup.position.y;
        playerGroup.position.y += heightDelta * physics.suspension;
        if (Math.abs(heightDelta) > 18) playerGroup.position.y = targetY;
        physics.velocity.y = 0;
        if (keys.space) {
            physics.velocity.y = physics.jumpForce;
            physics.isGrounded = false;
        }
    } else {
        physics.velocity.y -= physics.gravity;
        playerGroup.position.y += physics.velocity.y;
        if (playerGroup.position.y <= targetY) {
            playerGroup.position.y = targetY;
            physics.isGrounded = true;
        }
    }

    scratch.forwardVector.set(Math.sin(physics.heading), 0, Math.cos(physics.heading));
    playerGroup.position.addScaledVector(scratch.forwardVector, physics.speed);

    updateTerrainChunks();
    alignPlayerToTerrain();
    tiltBoardToTerrain();

    const speedRatio = THREE.MathUtils.clamp(Math.abs(physics.speed) / (physics.maxSpeed * physics.boostMultiplier), 0, 1);
    updateSpeedLines(speedRatio, isBoosting);
    const speedometer = document.getElementById('speedometer');
    if (speedometer) {
        speedometer.innerText = `${(Math.abs(physics.speed) * 80).toFixed(1)} U/S${isBoosting ? '  BOOST' : ''}  | chunks ${terrainChunks.size}`;
    }
}

export function startGameLoop() {
    function animate() {
        requestAnimationFrame(animate);
        handlePhysics();
        updateCamera();

        if (Math.abs(physics.speed) > 0.05) {
            const time = Date.now() * 0.015;
            if (tail) {
                tail.rotation.z = Math.sin(time) * 0.4;
            }
            for (let i = 1; i < skateboard.children.length; i++) {
                skateboard.children[i]!.rotation.x += physics.speed * 2;
            }
        }
        renderer.render(scene, camera);
    }

    animate();
}
