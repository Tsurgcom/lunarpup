import { Canvas } from "@react-three/fiber";

export function App() {
  return (
    <div className="app">
      <Canvas camera={{ position: [0, 4, 8], fov: 50 }}>
        <color attach="background" args={["#0b0e14"]} />
        <ambientLight intensity={0.4} />
        <directionalLight position={[6, 10, 4]} intensity={1.2} />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
          <circleGeometry args={[8, 48]} />
          <meshStandardMaterial color="#6b6f78" />
        </mesh>
        <mesh position={[0, 0.6, 0]}>
          <boxGeometry args={[1, 1.2, 0.6]} />
          <meshStandardMaterial color="#c4a574" />
        </mesh>
      </Canvas>
      <div className="overlay">
        <h1>Lunar Pup</h1>
        <p>v3 — empty shell. Copy pieces from <code>v1/</code> and <code>v2/</code>.</p>
      </div>
    </div>
  );
}
