import * as THREE from 'three';
import type { Mesh, Group, PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import type { MultiplayerClient } from './net/client.ts';

export const keys = { w: false, a: false, s: false, d: false, space: false, shift: false };

export const physics = {
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
};

export const cameraControl = {
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
};

export let scene: Scene;
export let camera: PerspectiveCamera;
export let renderer: WebGLRenderer;
export let playerGroup: Group;
export let skateboard: Group;
export let dog: Group;
export let tail: Mesh;
export let terrainRoot: Group;

export const terrainChunks = new Map<string, Mesh>();
export const terrainMaterials: Record<string, THREE.MeshStandardMaterial> = {};

export const scratch = {
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
};

export let speedLines: HTMLDivElement[] = [];
export let multiplayerClient: MultiplayerClient | null = null;

export function setScene(s: Scene) { scene = s; }
export function setCamera(c: PerspectiveCamera) { camera = c; }
export function setRenderer(r: WebGLRenderer) { renderer = r; }
export function setPlayerGroup(g: Group) { playerGroup = g; }
export function setSkateboard(g: Group) { skateboard = g; }
export function setDog(g: Group) { dog = g; }
export function setTail(m: Mesh) { tail = m; }
export function setTerrainRoot(g: Group) { terrainRoot = g; }
export function setSpeedLines(lines: HTMLDivElement[]) { speedLines = lines; }
export function setMultiplayerClient(client: MultiplayerClient | null) { multiplayerClient = client; }
