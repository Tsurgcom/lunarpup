import * as THREE from 'three';
import { createTrickSimulation } from './trickSimulation.ts';
import type { GameRuntime } from './types.ts';

export function createGameRuntime(): GameRuntime {
    return {
        keys: {
            w: false,
            a: false,
            s: false,
            d: false,
            q: false,
            e: false,
            f: false,
            space: false,
            shift: false,
        },
        jumpInput: { queuedAt: 0 },
        physics: {
            speed: 0,
            maxSpeed: 0.8,
            accel: 0.015,
            decel: 0.01,
            rotationSpeed: 0.04,
            gravity: 0.004,
            jumpForce: 0.15,
            suspension: 0.22,
            tiltSmoothing: 0.18,
            boostMultiplier: 1.85,
            boostAccelMultiplier: 2.2,
            cameraBaseFov: 60,
            cameraMaxFov: 84,
            heading: 0,
            velocity: new THREE.Vector3(),
            isGrounded: true,
            airTime: 0,
        },
        cameraControl: {
            yaw: Math.PI,
            pitch: 0.38,
            distance: 14,
            minDistance: 5,
            maxDistance: 42,
            sensitivity: 0.006,
            zoomSensitivity: 0.0015,
            autoFollowStrength: 0.025,
            fovSmoothing: 0.08,
            isDragging: false,
            lastX: 0,
            lastY: 0,
        },
        scratch: {
            forwardVector: new THREE.Vector3(),
            upAxis: new THREE.Vector3(0, 1, 0),
            camOffset: new THREE.Vector3(),
            targetCamPos: new THREE.Vector3(),
            lookTarget: new THREE.Vector3(),
            rightVector: new THREE.Vector3(),
            terrainNormal: new THREE.Vector3(0, 1, 0),
            normalProbeA: new THREE.Vector3(),
            normalProbeB: new THREE.Vector3(),
            normalProbeC: new THREE.Vector3(),
            playerMatrix: new THREE.Matrix4(),
            targetPlayerQuat: new THREE.Quaternion(),
            baseForward: new THREE.Vector3(),
            slopeForward: new THREE.Vector3(),
            slopeRight: new THREE.Vector3(),
        },
        parts: null,
        trickState: createTrickSimulation(),
        frameHud: {},
        multiplayerClient: null,
    };
}

export function getPlayerRoot(runtime: GameRuntime) {
    return runtime.parts?.playerGroup ?? runtime.parts?.group ?? null;
}
