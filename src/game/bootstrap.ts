import { groundClearance } from '../config.ts';
import { physics, playerGroup, setSpeedLines } from '../state.ts';
import { getMultiplayerConfig, isLocalDevHost } from '../net/protocol.ts';

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
        { setupMultiplayerUI, updateMultiplayerStatus, updateMultiplayerHint },
        { setupMinimap },
        { setupChatUI },
        { setupUpdateNotice },
        { setupExtensions },
        { setupCosmeticsUI },
        { setupGamemodeUI },
        { setupMainMenu, setupMenuButton },
        { setupPauseMenu },
        { revealPanel },
        { hasSeenMainMenu },
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
        import('../extensions/client.ts'),
        import('../ui/cosmetics.ts'),
        import('../modes/client.ts'),
        import('../ui/mainMenu.ts'),
        import('../ui/pauseMenu.ts'),
        import('../ui/menuNav.ts'),
        import('../ui/menuState.ts'),
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
    setupMultiplayerUI({
        enabled: mpConfig.enabled,
        room: mpConfig.room,
        name: mpConfig.name,
        apiBase: mpConfig.apiBase,
        wsUrl: mpConfig.wsUrl,
        onJoinRoom: (roomId) => {
            const url = new URL(location.href);
            url.searchParams.set('multiplayer', '');
            url.searchParams.set('room', roomId);
            if (!url.searchParams.has('name')) url.searchParams.set('name', mpConfig.name);
            location.href = url.href;
        },
    });
    setupMinimap();
    setupChatUI(mpConfig.enabled, mpConfig.name);
    setupCosmeticsUI();
    setupUpdateNotice();
    await setupExtensions();
    setupGamemodeUI();

    const mainMenu = setupMainMenu({
        openRooms: () => revealPanel('multiplayer-panel'),
        openCosmetics: () => revealPanel('cosmetics-panel'),
        openSettings: () => revealPanel('tuning-panel'),
    });
    setupPauseMenu({
        openSettings: () => revealPanel('tuning-panel'),
        quitToMenu: () => mainMenu.show(),
        canOpen: () => !mainMenu.isOpen(),
    });
    setupMenuButton(() => mainMenu.show());
    if (!hasSeenMainMenu()) mainMenu.show();

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

    startGameLoop();
}
