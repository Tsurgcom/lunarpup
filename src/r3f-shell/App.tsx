import { Canvas } from '@react-three/fiber';
import './shell.css';

function ShellScene() {
    return (
        <>
            <color attach="background" args={['#020208']} />
            <ambientLight intensity={1.5} color={0x222233} />
            <directionalLight position={[100, 150, 50]} intensity={1.8} color={0xddddff} />
            <mesh position={[0, -1, 0]}>
                <boxGeometry args={[1, 1, 1]} />
                <meshStandardMaterial color="#8b91a8" />
            </mesh>
        </>
    );
}

export function App() {
    return (
        <main className="r3f-shell">
            <Canvas
                camera={{ fov: 60, near: 0.1, far: 2500, position: [0, 3, 8] }}
                gl={{ antialias: true, powerPreference: 'high-performance' }}
                dpr={[1, 2]}
            >
                <ShellScene />
            </Canvas>
            <div className="r3f-shell-label">R3F shell — vanilla game remains active</div>
        </main>
    );
}
