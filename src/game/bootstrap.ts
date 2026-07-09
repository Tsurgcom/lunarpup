import { groundClearance } from '../config.ts';
import { physics, playerGroup, setMultiplayerClient } from '../state.ts';
import { getMultiplayerConfig, isLocalDevHost } from '../net/protocol.ts';

import type { SceneHost } from './scene.ts';
import type { VoxelDogParts } from './player.ts';

export async function bootstrap(options: { r3fHost: SceneHost; r3fPlayer: VoxelDogParts }) {
    const mpConfig = getMultiplayerConfig();

    const [
        { initScene },
        { getTerrainHeight, alignPlayerToTerrain },
        { bindPlayerParts },
        { setupCameraControls, startGameLoop },
        { updateMultiplayerStatus, updateMultiplayerHint },
    ] = await Promise.all([
        import('./scene.ts'),
        import('./terrain.ts'),
        import('./player.ts'),
        import('./loop.ts'),
        import('../ui/multiplayer.ts'),
    ]);

    initScene(options.r3fHost);
    bindPlayerParts(options.r3fPlayer);

    playerGroup.position.set(0, getTerrainHeight(0, 0) + groundClearance, 0);
    physics.heading = 0;
    alignPlayerToTerrain();

    const removeCameraControls = setupCameraControls();

    let disposeMultiplayer: (() => void) | undefined;

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
            disposeMultiplayer = initMultiplayer(mpConfig);
            if (mpConfig.transport === 'http') {
                updateMultiplayerHint('Multiplayer runs on Netlify (SSE + Blobs). Share this URL with friends.');
            }
        }
    }

    startGameLoop();

    return () => {
        removeCameraControls();
        disposeMultiplayer?.();
        setMultiplayerClient(null);
    };
}
