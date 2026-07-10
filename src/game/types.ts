import type * as THREE from 'three';
import type { MultiplayerClient } from '../net/client.ts';
import type { TrickScore } from './trickScoring.ts';
import type { TrickSimulationState } from './trickSimulation.ts';

export interface VoxelDogParts {
    group: THREE.Group;
    playerGroup?: THREE.Group;
    skateboard: THREE.Group;
    dog: THREE.Group;
    tail: THREE.Mesh;
}

export interface KeysState {
    w: boolean;
    a: boolean;
    s: boolean;
    d: boolean;
    q: boolean;
    e: boolean;
    f: boolean;
    space: boolean;
    shift: boolean;
}

export interface JumpInputState {
    queuedAt: number;
}

export interface PhysicsState {
    mass: number;
    thrustForce: number;
    hoverStiffness: number;
    hoverDamping: number;
    maxHoverForce: number;
    maxHoverRange: number;
    coastFriction: number;
    coastDrag: number;
    airDrag: number;
    maxSpeed: number;
    rotationSpeed: number;
    gravity: number;
    jumpImpulse: number;
    tiltSmoothing: number;
    driftSlideMultiplier: number;
    slideGrip: number;
    driftGripMultiplier: number;
    driftThreshold: number;
    boostMultiplier: number;
    boostAccelMultiplier: number;
    airThrustMultiplier: number;
    airTurnMultiplier: number;
    airSteerGrip: number;
    airHoverAssist: number;
    hoverLandingSpeed: number;
    cameraBaseFov: number;
    cameraMaxFov: number;
    heading: number;
    velocity: THREE.Vector3;
    isGrounded: boolean;
    airTime: number;
}

export interface CameraControlState {
    yaw: number;
    pitch: number;
    distance: number;
    minDistance: number;
    maxDistance: number;
    sensitivity: number;
    zoomSensitivity: number;
    autoFollowStrength: number;
    fovSmoothing: number;
    isDragging: boolean;
    lastX: number;
    lastY: number;
}

export interface ScratchVectors {
    upAxis: THREE.Vector3;
    camOffset: THREE.Vector3;
    targetCamPos: THREE.Vector3;
    lookTarget: THREE.Vector3;
    rightVector: THREE.Vector3;
    terrainNormal: THREE.Vector3;
    normalProbeA: THREE.Vector3;
    normalProbeB: THREE.Vector3;
    normalProbeC: THREE.Vector3;
    playerMatrix: THREE.Matrix4;
    targetPlayerQuat: THREE.Quaternion;
    baseForward: THREE.Vector3;
    slopeForward: THREE.Vector3;
    slopeRight: THREE.Vector3;
    acceleration: THREE.Vector3;
    normalAcceleration: THREE.Vector3;
    tangentVelocity: THREE.Vector3;
}

export interface FrameHudCallbacks {
    setSpeedText?: (text: string) => void;
    updateSpeedLines?: (speedRatio: number, isBoosting: boolean) => void;
    redrawMinimap?: () => void;
    updateTrickScore?: (totalScore: number) => void;
    updateCurrentTrick?: (rotation: number, grabbing: boolean) => void;
    showTrickResult?: (result: TrickScore) => void;
}

export interface RemotePlayerRecord {
    id: string;
    name: string;
    color: number;
    target: import('../net/protocol.ts').PlayerSnapshot;
    current: import('../net/protocol.ts').PlayerSnapshot;
}

export interface GameRuntime {
    keys: KeysState;
    jumpInput: JumpInputState;
    physics: PhysicsState;
    cameraControl: CameraControlState;
    scratch: ScratchVectors;
    parts: VoxelDogParts | null;
    trickState: TrickSimulationState;
    frameHud: FrameHudCallbacks;
    multiplayerClient: MultiplayerClient | null;
}
