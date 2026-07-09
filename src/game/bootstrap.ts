import { groundClearance } from '../config.ts';
import { physics, playerGroup, setSpeedLines } from '../state.ts';
import { getMultiplayerConfig, isLocalDevHost } from '../net/protocol.ts';

import type { SceneHost } from './scene.ts';

export async function bootstrap(options: { r3fHost?: SceneHost } = {}) {
    const container = options.r3fHost ? undefined : document.getElementById('canvas-container');
    if (!options.r3fHost && !container) throw new Error('Missing #canvas-container');

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
        { setupMultiplayerUI, updateMultiplayerStatus, updateMultiplayerHint },
        { setupMinimap },
        { setupChatUI },
        { setupUpdateNotice },
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
        import('../ui/minimap.ts'),
        import('../ui/chat.ts'),
        import('../ui/updateNotice.ts'),
    ]);

    initScene(container ?? undefined, options.r3fHost);
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
    setupMinimap();
    setupChatUI(mpConfig.enabled, mpConfig.name);
    setupUpdateNotice();

    if (mpConfig.enabled) {
        if (mpConfig.transport === 'ws' && !mpConfig.wsUrl) {
            updateMultiplayerStatus('error', 'Multiplayer server not configured');
            updateMultiplayerHint(
                isLocalDevHost()
                    ? 'Start the server with <code>bun run dev:server</code> (port 3001).'
                    : 'Add <code>&amp;ws=wss://your-ws-host.example.com</code> to use an external WebSocket server.',
            );
        } else {
            const { initMultiplayer } = await import('./multiplayer.ts');
            initMultiplayer(mpConfig);
            if (mpConfig.transport === 'http') {
                updateMultiplayerHint('Multiplayer runs on Netlify (SSE + Blobs). Share this URL with friends.');
            }
        }
    }

    window.addEventListener('resize', onWindowResize);

    startGameLoop({ externalRenderLoop: Boolean(options.r3fHost) });
}
