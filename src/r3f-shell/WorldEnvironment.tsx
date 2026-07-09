import { useMemo } from 'react';

const BACKGROUND = '#020208';
const STAR_COUNT = 1000;
const STAR_RADIUS = 600;

function createStarPositions() {
    const positions = new Float32Array(STAR_COUNT * 3);

    for (let index = 0; index < positions.length; index += 3) {
        const u = Math.random();
        const v = Math.random();
        const theta = u * 2 * Math.PI;
        const phi = Math.acos(2 * v - 1);

        positions[index] = STAR_RADIUS * Math.sin(phi) * Math.cos(theta);
        positions[index + 1] = STAR_RADIUS * Math.sin(phi) * Math.sin(theta);
        positions[index + 2] = STAR_RADIUS * Math.cos(phi);
    }

    return positions;
}

function Starfield() {
    const positions = useMemo(createStarPositions, []);

    return (
        <points>
            <bufferGeometry>
                <bufferAttribute attach="attributes-position" args={[positions, 3]} />
            </bufferGeometry>
            <pointsMaterial color="#ffffff" size={0.8} sizeAttenuation />
        </points>
    );
}

export function WorldEnvironment() {
    return (
        <>
            <color attach="background" args={[BACKGROUND]} />
            <fogExp2 attach="fog" args={[BACKGROUND, 0.0018]} />
            <ambientLight color="#222233" intensity={1.5} />
            <directionalLight
                color="#ddddff"
                intensity={1.8}
                position={[100, 150, 50]}
                castShadow
                shadow-mapSize={[1024, 1024]}
                shadow-camera-near={0.5}
                shadow-camera-far={500}
                shadow-camera-left={-250}
                shadow-camera-right={250}
                shadow-camera-top={250}
                shadow-camera-bottom={-250}
            />
            <Starfield />
            <mesh position={[-420, 220, -520]}>
                <sphereGeometry args={[15, 16, 16]} />
                <meshPhongMaterial color="#223388" emissive="#111133" flatShading />
            </mesh>
        </>
    );
}
