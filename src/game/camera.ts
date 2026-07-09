import * as THREE from 'three';
import type { GameRuntime } from './types.ts';
import { getPlayerRoot } from './runtime.ts';

function lerpAngle(a: number, b: number, t: number) {
    const delta = Math.atan2(Math.sin(b - a), Math.cos(b - a));
    return a + delta * t;
}

export function updateCamera(runtime: GameRuntime, camera: THREE.PerspectiveCamera, dt: number) {
    const { physics, cameraControl, keys, scratch } = runtime;
    const playerGroup = getPlayerRoot(runtime);
    if (!playerGroup) return;

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

export function setupCameraControls(canvas: HTMLCanvasElement, runtime: GameRuntime) {
    const { cameraControl } = runtime;

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
