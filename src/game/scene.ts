import * as THREE from 'three';
import {
    setScene,
    setCamera,
    setRenderer,
} from '../state.ts';

export type SceneHost = {
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
};

export function initScene(host: SceneHost) {
    const { scene: s, camera: cam, renderer: r } = host;
    s.background = new THREE.Color(0x020208);
    s.fog = new THREE.FogExp2(0x020208, 0.0018);
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    setScene(s);
    setCamera(cam);
    setRenderer(r);
}
