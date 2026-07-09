import { groundClearance } from '../config.ts';
import { physics, playerGroup, setSpeedLines } from '../state.ts';

export async function bootstrap() {
    const container = document.getElementById('canvas-container');
    if (!container) throw new Error('Missing #canvas-container');

    const [
        { initScene, onWindowResize },
        { initTerrain, getTerrainHeight, updateTerrainChunks, alignPlayerToTerrain },
        { createPlayer },
        { setupCameraControls, startGameLoop },
        { setupTuningPanel },
        { setupSpeedLines },
        { bindInput },
    ] = await Promise.all([
        import('./scene.ts'),
        import('./terrain.ts'),
        import('./player.ts'),
        import('./loop.ts'),
        import('../ui/tuning.ts'),
        import('../ui/speedLines.ts'),
        import('./input.ts'),
    ]);

    initScene(container);
    initTerrain();
    createPlayer();
    bindInput();

    playerGroup.position.set(0, getTerrainHeight(0, 0) + groundClearance, 0);
    physics.heading = 0;
    updateTerrainChunks(true);
    alignPlayerToTerrain();

    setupCameraControls();
    setSpeedLines(setupSpeedLines());
    setupTuningPanel();

    window.addEventListener('resize', onWindowResize);

    startGameLoop();
}
