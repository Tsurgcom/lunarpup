import * as THREE from 'three';
import type { PlayerSnapshot } from '../net/protocol.ts';
import { scene } from '../state.ts';
import { createVoxelDog } from './player.ts';

interface RemotePlayer {
    id: string;
    name: string;
    parts: ReturnType<typeof createVoxelDog>;
    target: PlayerSnapshot;
    current: PlayerSnapshot;
}

const remotePlayers = new Map<string, RemotePlayer>();

function deckColorFromDog(dogColor: number): number {
    return new THREE.Color(dogColor).multiplyScalar(0.55).getHex();
}

function disposeRemoteParts(parts: ReturnType<typeof createVoxelDog>) {
    parts.group.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.dispose();
        const { material } = object;
        if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
        else material.dispose();
    });
}

export function addRemotePlayer(player: PlayerSnapshot, localId = '') {
    if (localId && player.id === localId) return;
    if (remotePlayers.has(player.id)) return;

    const parts = createVoxelDog(player.color, deckColorFromDog(player.color));
    parts.group.position.set(player.x, player.y, player.z);
    parts.group.quaternion.set(player.qx, player.qy, player.qz, player.qw);
    parts.skateboard.rotation.x = player.boardTiltX;
    parts.skateboard.rotation.z = player.boardTiltZ;
    scene.add(parts.group);

    remotePlayers.set(player.id, {
        id: player.id,
        name: player.name,
        parts,
        target: { ...player },
        current: { ...player },
    });
}

export function removeRemotePlayer(id: string) {
    const remote = remotePlayers.get(id);
    if (!remote) return;
    scene.remove(remote.parts.group);
    disposeRemoteParts(remote.parts);
    remotePlayers.delete(id);
}

export function updateRemoteTarget(id: string, state: Omit<PlayerSnapshot, 'id' | 'name' | 'color'>) {
    const remote = remotePlayers.get(id);
    if (!remote) return;
    Object.assign(remote.target, state);
}

export function getRemotePlayerNames(): string[] {
    return [...remotePlayers.values()].map(p => p.name);
}

export function findRemotePlayerByName(name: string): RemotePlayer | undefined {
    const lower = name.toLowerCase();
    for (const remote of remotePlayers.values()) {
        if (remote.name.toLowerCase() === lower) return remote;
    }
    return undefined;
}

export function getRemotePlayerMarkers(): { id: string; name: string; color: number; x: number; z: number }[] {
    return [...remotePlayers.values()].map(p => ({
        id: p.id,
        name: p.name,
        color: p.target.color,
        x: p.current.x,
        z: p.current.z,
    }));
}

export function getRemotePlayerCount(): number {
    return remotePlayers.size;
}

export function clearRemotePlayers() {
    for (const id of [...remotePlayers.keys()]) {
        removeRemotePlayer(id);
    }
}

export function updateRemotePlayers(dt: number) {
    const lerpFactor = 1 - Math.pow(0.001, dt);

    for (const remote of remotePlayers.values()) {
        const { parts, target, current } = remote;

        current.x = THREE.MathUtils.lerp(current.x, target.x, lerpFactor);
        current.y = THREE.MathUtils.lerp(current.y, target.y, lerpFactor);
        current.z = THREE.MathUtils.lerp(current.z, target.z, lerpFactor);
        current.heading = lerpAngle(current.heading, target.heading, lerpFactor);
        current.speed = THREE.MathUtils.lerp(current.speed, target.speed, lerpFactor);
        current.boardTiltX = THREE.MathUtils.lerp(current.boardTiltX, target.boardTiltX, lerpFactor);
        current.boardTiltZ = THREE.MathUtils.lerp(current.boardTiltZ, target.boardTiltZ, lerpFactor);
        current.isGrounded = target.isGrounded;

        parts.group.position.set(current.x, current.y, current.z);
        parts.group.quaternion.slerp(
            new THREE.Quaternion(target.qx, target.qy, target.qz, target.qw),
            lerpFactor,
        );
        parts.skateboard.rotation.x = current.boardTiltX;
        parts.skateboard.rotation.z = current.boardTiltZ;

        if (Math.abs(current.speed) > 0.05) {
            const time = Date.now() * 0.015;
            parts.tail.rotation.z = Math.sin(time + current.x) * 0.4;
            for (let i = 1; i < parts.skateboard.children.length; i++) {
                parts.skateboard.children[i]!.rotation.x += current.speed * 2 * dt * 60;
            }
        }
    }
}

function lerpAngle(a: number, b: number, t: number) {
    const delta = Math.atan2(Math.sin(b - a), Math.cos(b - a));
    return a + delta * t;
}
