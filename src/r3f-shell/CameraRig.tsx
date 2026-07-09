import type { MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { updateCamera } from '../game/loop.ts';

export function CameraRig({ ready }: { ready: MutableRefObject<boolean> }) {
    useFrame((_, delta) => {
        if (ready.current) updateCamera(Math.min(delta, 0.05));
    });

    return null;
}
