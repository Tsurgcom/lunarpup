import { groundClearance } from '../config.ts';
import { physics, playerGroup, setSpeedLines } from '../state.ts';
import { getMultiplayerConfig } from '../net/protocol.ts';

export async function bootstrap() {
    const container = document.getElementById('canvas-container');
    if (!container) throw new Error('Missing #canvas-container');

    const mpConfig = getMultiplayerConfig();

    const [
        { initScene, onWindowResize },
        { initTerrain, getTerrainHeight, updateTerrainChunks, alignPlayerToTerrain },
        { createPlayer },
        { setupCameraControls, startGameLoop },
        { setupTuningPanel },
        { setupSpeedLines },
        { setupTrickUI },
        { bindInput },
        { setupMultiplayerUI },
    ] = await Promise.all([
        import('./scene.ts'),
        import('./terrain.ts'),
        import('./player.ts'),
        import('./loop.ts'),
        import('../ui/tuning.ts'),
        import('../ui/speedLines.ts'),
        import('../ui/tricks.ts'),
        import('./input.ts'),
        import('../ui/multiplayer.ts'),
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
    setupTrickUI();
    setupTuningPanel();
    setupMultiplayerUI();

    if (mpConfig.enabled) {
        const { initMultiplayer } = await import('./multiplayer.ts');
        initMultiplayer(mpConfig);
    }

    window.addEventListener('resize', onWindowResize);

    startGameLoop();
}
