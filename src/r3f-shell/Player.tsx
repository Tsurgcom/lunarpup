import { useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import { bindPlayerParts } from '../game/player.ts';
import { PLAYER_COLORS } from '../net/protocol.ts';
import type { VoxelDogParts } from '../game/player.ts';

type PlayerProps = {
    onReady: (parts: VoxelDogParts) => void;
};

const WHEEL_POSITIONS: Array<[number, number, number]> = [
    [-0.7, 0.2, 1.2], [0.7, 0.2, 1.2],
    [-0.7, 0.2, -1.2], [0.7, 0.2, -1.2],
];

export function Player({ onReady }: PlayerProps) {
    const playerGroup = useRef<THREE.Group>(null!);
    const group = useRef<THREE.Group>(null!);
    const skateboard = useRef<THREE.Group>(null!);
    const dog = useRef<THREE.Group>(null!);
    const tail = useRef<THREE.Mesh>(null!);
    const dogColor = PLAYER_COLORS[0];
    const snoutColor = new THREE.Color(dogColor).lerp(new THREE.Color(0xdda15e), 0.45).getHex();

    useLayoutEffect(() => {
        const parts = { group: group.current, playerGroup: playerGroup.current, skateboard: skateboard.current, dog: dog.current, tail: tail.current };
        bindPlayerParts(parts);
        onReady(parts);
    }, [onReady]);

    return (
        <group ref={playerGroup}>
          <group ref={group}>
            <group ref={skateboard}>
                <mesh position={[0, 0.3, 0]} castShadow>
                    <boxGeometry args={[1.6, 0.15, 3.8]} />
                    <meshStandardMaterial color="#ff5555" roughness={0.5} />
                </mesh>
                {WHEEL_POSITIONS.map((position) => (
                    <mesh key={position.join(',')} position={position} castShadow rotation={[0, 0, Math.PI / 2]}>
                        <cylinderGeometry args={[0.25, 0.25, 0.3, 8]} />
                        <meshStandardMaterial color="#eeeeee" roughness={0.2} />
                    </mesh>
                ))}
            </group>
            <group ref={dog} position={[0, 0.15, 0]}>
                <mesh position={[0, 0.9, 0]} castShadow userData={{ dogPart: 'fur' }}>
                    <boxGeometry args={[1, 0.9, 2]} />
                    <meshStandardMaterial color={dogColor} flatShading />
                </mesh>
                <group position={[0, 1.6, 0.7]}>
                    <mesh castShadow userData={{ dogPart: 'fur' }}><boxGeometry args={[0.9, 0.9, 0.9]} /><meshStandardMaterial color={dogColor} flatShading /></mesh>
                    <group position={[0, -0.15, 0.5]}>
                        <mesh userData={{ dogPart: 'snout' }}><boxGeometry args={[0.5, 0.4, 0.4]} /><meshStandardMaterial color={snoutColor} flatShading /></mesh>
                        <mesh position={[0, 0.1, 0.22]}><boxGeometry args={[0.16, 0.16, 0.1]} /><meshStandardMaterial color="#222222" /></mesh>
                    </group>
                    {[-0.5, 0.5].map((x) => <mesh key={`ear-${x}`} position={[x, 0.1, -0.1]} userData={{ dogPart: 'fur' }}><boxGeometry args={[0.2, 0.6, 0.3]} /><meshStandardMaterial color={dogColor} flatShading /></mesh>)}
                    {[-0.25, 0.25].map((x) => <mesh key={`eye-${x}`} position={[x, 0.15, 0.46]}><boxGeometry args={[0.12, 0.12, 0.1]} /><meshStandardMaterial color="#222222" /></mesh>)}
                </group>
                {[[0.35, 0.25, 0.7], [-0.35, 0.25, 0.7], [0.35, 0.25, -0.7], [-0.35, 0.25, -0.7]].map((position) => (
                    <mesh key={position.join(',')} position={position as [number, number, number]} castShadow userData={{ dogPart: 'fur' }}><boxGeometry args={[0.3, 0.5, 0.3]} /><meshStandardMaterial color={dogColor} flatShading /></mesh>
                ))}
                <mesh ref={tail} position={[0, 1.2, -1.1]} rotation={[Math.PI / 4, 0, 0]} castShadow userData={{ dogPart: 'fur' }}>
                    <boxGeometry args={[0.2, 0.2, 0.7]} />
                    <meshStandardMaterial color={dogColor} flatShading />
                </mesh>
            </group>
          </group>
        </group>
    );
}
