import { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import type { RootState } from '@react-three/fiber';
import type * as THREE from 'three';
import { bootstrap } from '../game/bootstrap.ts';
import { stepGameFrame } from '../game/loop.ts';

function GameHost() {
    const booting = useRef(false);
    const ready = useRef(false);

    useFrame((_, delta) => {
        if (ready.current) stepGameFrame(Math.min(delta, 0.05));
    });

    const onCreated = ({ scene, camera, gl }: RootState) => {
        if (booting.current || ready.current) return;
        booting.current = true;
        void bootstrap({ r3fHost: { scene, camera: camera as THREE.PerspectiveCamera, renderer: gl } })
            .then(() => { ready.current = true; })
            .catch((error) => {
                booting.current = false;
                console.error('R3F game bootstrap failed', error);
            });
    };

    return <Canvas onCreated={onCreated} camera={{ fov: 60, near: 0.1, far: 2500 }} gl={{ antialias: true, powerPreference: 'high-performance' }} dpr={[1, 2]} shadows />;
}

export function GameCanvas() {
    return <GameHost />;
}
