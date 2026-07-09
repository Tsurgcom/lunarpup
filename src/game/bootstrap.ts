import { groundClearance } from '../config.ts';
import { physics, playerGroup, setSpeedLines } from '../state.ts';
import { getMultiplayerConfig, isLocalDevHost } from '../net/protocol.ts';

import type { SceneHost } from './scene.ts';
import type { VoxelDogParts } from './player.ts';

export async function bootstrap(options: { r3fHost?: SceneHost; r3fPlayer?: VoxelDogParts } = {}) {
    const container = options.r3fHost ? undefined : document.getElementById('canvas-container');
    if (!options.r3fHost && !container) throw new Error('Missing #canvas-container');

    const mpConfig = getMultiplayerConfig();

    const [
        { initScene, onWindowResize },
        { initTerrain, getTerrainHeight, updateTerrainChunks, alignPlayerToTerrain, setTerrainPresentationMode },
        { createPlayer, bindPlayerParts },
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
    setTerrainPresentationMode(options.r3fHost ? 'r3f' : 'legacy');
    initTerrain();
    if (options.r3fPlayer) bindPlayerParts(options.r3fPlayer);
    else createPlayer();
    const unbindInput = options.r3fHost ? undefined : bindInput();

    playerGroup.position.set(0, getTerrainHeight(0, 0) + groundClearance, 0);
    physics.heading = 0;
    updateTerrainChunks(true);
    alignPlayerToTerrain();

    const removeCameraControls = setupCameraControls();
    setSpeedLines(setupSpeedLines());
    setupTrickUI();
    // React owns tuning controls in the R3F entry. Keep vanilla self-contained
    // while its remaining imperative UI is migrated in bounded batches.
    if (!options.r3fHost) setupTuningPanel();
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

    // Canvas measures and resizes itself in R3F mode. The legacy renderer still
    // needs its window listener until the temporary entry is removed.
    if (!options.r3fHost) window.addEventListener('resize', onWindowResize);

    startGameLoop({ externalRenderLoop: Boolean(options.r3fHost) });

    return () => {
        unbindInput?.();
        removeCameraControls();
        if (!options.r3fHost) window.removeEventListener('resize', onWindowResize);
    };
}
