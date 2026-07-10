import * as THREE from 'three';
import type { RemotePlayerRecord } from '../game/types.ts';

export function lerpRemotePlayers(map: Map<string, RemotePlayerRecord>, dt: number) {
    const lerpFactor = 1 - Math.pow(0.001, dt);

    for (const remote of map.values()) {
        const { target, current } = remote;

        current.x = THREE.MathUtils.lerp(current.x, target.x, lerpFactor);
        current.y = THREE.MathUtils.lerp(current.y, target.y, lerpFactor);
        current.z = THREE.MathUtils.lerp(current.z, target.z, lerpFactor);
        current.heading = lerpAngle(current.heading, target.heading, lerpFactor);
        current.speed = THREE.MathUtils.lerp(current.speed, target.speed, lerpFactor);
        current.boardTiltX = THREE.MathUtils.lerp(current.boardTiltX, target.boardTiltX, lerpFactor);
        current.boardTiltZ = THREE.MathUtils.lerp(current.boardTiltZ, target.boardTiltZ, lerpFactor);
        current.isGrounded = target.isGrounded;
        current.qx = THREE.MathUtils.lerp(current.qx, target.qx, lerpFactor);
        current.qy = THREE.MathUtils.lerp(current.qy, target.qy, lerpFactor);
        current.qz = THREE.MathUtils.lerp(current.qz, target.qz, lerpFactor);
        current.qw = THREE.MathUtils.lerp(current.qw, target.qw, lerpFactor);
    }
}

function lerpAngle(a: number, b: number, t: number) {
    const delta = Math.atan2(Math.sin(b - a), Math.cos(b - a));
    return a + delta * t;
}
