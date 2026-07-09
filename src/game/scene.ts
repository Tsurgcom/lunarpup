import * as THREE from 'three';
import {
    setScene,
    setCamera,
    setRenderer,
    scene,
    camera,
    renderer,
} from '../state.ts';

export function initScene(container: HTMLElement) {
    const s = new THREE.Scene();
    s.background = new THREE.Color(0x020208);
    s.fog = new THREE.FogExp2(0x020208, 0.0018);
    setScene(s);

    const cam = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2500);
    setCamera(cam);

    const r = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    r.setSize(window.innerWidth, window.innerHeight);
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(r.domElement);
    setRenderer(r);

    setupLighting();
    createStarfield();

    return { scene: s, camera: cam, renderer: r };
}

function setupLighting() {
    const ambientLight = new THREE.AmbientLight(0x222233, 1.5);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xddddff, 1.8);
    sunLight.position.set(100, 150, 50);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 1024;
    sunLight.shadow.mapSize.height = 1024;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 500;

    const d = 250;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    scene.add(sunLight);
}

function createStarfield() {
    const starsGeometry = new THREE.BufferGeometry();
    const starsCount = 1000;
    const starPositions = new Float32Array(starsCount * 3);

    for (let i = 0; i < starsCount * 3; i += 3) {
        const u = Math.random();
        const v = Math.random();
        const theta = u * 2.0 * Math.PI;
        const phi = Math.acos(2.0 * v - 1.0);
        const radius = 600;

        starPositions[i] = radius * Math.sin(phi) * Math.cos(theta);
        starPositions[i + 1] = radius * Math.sin(phi) * Math.sin(theta);
        starPositions[i + 2] = radius * Math.cos(phi);
    }

    starsGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const starsMaterial = new THREE.PointsMaterial({ color: 0xffffff, size: 0.8, sizeAttenuation: true });
    const starField = new THREE.Points(starsGeometry, starsMaterial);
    scene.add(starField);

    const earthGeo = new THREE.SphereGeometry(15, 16, 16);
    const earthMat = new THREE.MeshPhongMaterial({
        color: 0x223388,
        emissive: 0x111133,
        flatShading: true,
    });
    const earth = new THREE.Mesh(earthGeo, earthMat);
    earth.position.set(-420, 220, -520);
    scene.add(earth);
}

export function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}
