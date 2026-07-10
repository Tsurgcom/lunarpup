import * as THREE from 'three';
import { gamemodePackages } from '../../content/gamemodes/index.ts';
import { groundClearance } from '../config.ts';
import type { GamemodePackageDefinition, PlatformDefinition, RuntimeGamemodeState } from './runtime.ts';
import { createGamemode, createRuntimeState, orderedCheckpoints, validateGamemodePackage } from './runtime.ts';
import { getActiveRuntime, getRuntimeScene, registerUpdateHook, setCurrentGamemode } from '../game/runtimeRegistry.ts';
import { getTerrainHeight } from '../game/terrain.ts';
import { buildLocalSnapshot } from '../game/multiplayer.ts';
import { getApiBaseUrl, type PlayerSnapshot } from '../net/protocol.ts';

interface RunSample {
    t: number;
    x: number;
    y: number;
    z: number;
    speed: number;
}

let activeState: RuntimeGamemodeState | null = null;
let activePackage: GamemodePackageDefinition | null = null;
let unregisterHook: (() => void) | null = null;
let checkpointRoot: THREE.Group | null = null;
let sampleSocket: WebSocket | null = null;
let lastSampleMs = 0;
let samples: RunSample[] = [];
let resultsVisible = false;

function runtimeParts() {
    const runtime = getActiveRuntime();
    const playerGroup = runtime?.parts?.playerGroup ?? runtime?.parts?.group;
    const skateboard = runtime?.parts?.skateboard;
    const scene = getRuntimeScene();
    if (!runtime || !playerGroup || !skateboard || !scene) return null;
    return { runtime, playerGroup, skateboard, scene };
}

export function startGamemode(pkg: GamemodePackageDefinition): void {
    stopGamemode();
    const parts = runtimeParts();
    if (!parts) return;
    const { runtime, playerGroup, scene } = parts;
    const { physics } = runtime;
    activePackage = validateGamemodePackage(pkg);
    const snapshot = localPlayerSnapshot();
    const start = activePackage.params.startPosition;
    playerGroup.position.set(start.x, start.y || getTerrainHeight(start.x, start.z) + groundClearance, start.z);
    physics.speed = 0;
    physics.velocity.set(0, 0, 0);
    physics.isGrounded = true;
    snapshot.x = playerGroup.position.x;
    snapshot.y = playerGroup.position.y;
    snapshot.z = playerGroup.position.z;
    activeState = createRuntimeState(activePackage.params, snapshot);
    const gamemode = createGamemode(activePackage, event => {
        if (event.type === 'finish') showResults('finish');
    });
    void gamemode.init({ roomId: 'local', now: () => performance.now(), broadcast: () => undefined });
    void gamemode.start(activeState);
    setCurrentGamemode(gamemode, activeState);
    checkpointRoot = buildGamemodeMeshes(activePackage);
    scene.add(checkpointRoot);
    samples = [];
    lastSampleMs = 0;
    resultsVisible = false;
    const results = document.getElementById('gamemode-results');
    if (results) results.hidden = true;
    openSampleSocket();
    unregisterHook = registerUpdateHook((dt) => updateGamemode(dt));
    updateStatus();
}

export function stopGamemode(options: { preserveResults?: boolean } = {}): void {
    if (unregisterHook) unregisterHook();
    unregisterHook = null;
    setCurrentGamemode(null);
    if (checkpointRoot) {
        getRuntimeScene()?.remove(checkpointRoot);
        checkpointRoot.traverse(object => {
            if (object instanceof THREE.Mesh) {
                object.geometry.dispose();
                const material = object.material;
                if (Array.isArray(material)) {
                    for (const entry of material) entry.dispose();
                } else {
                    material.dispose();
                }
            }
        });
    }
    checkpointRoot = null;
    flushRunSamples('abandon');
    sampleSocket?.close();
    sampleSocket = null;
    activeState = null;
    activePackage = null;
    updateStatus();
    if (!options.preserveResults) {
        const results = document.getElementById('gamemode-results');
        if (results) results.hidden = true;
    }
}

export function endGamemode(): void {
    if (!activeState || !activePackage) return;
    showResults('ended');
    stopGamemode({ preserveResults: true });
}

export function disposeGamemodeUI(): void {
    stopGamemode();
    const status = document.getElementById('gamemode-status');
    const endButton = document.getElementById('gamemode-end-run');
    const results = document.getElementById('gamemode-results');
    if (status) {
        status.hidden = true;
        status.textContent = '';
    }
    if (endButton) endButton.hidden = true;
    if (results) {
        results.hidden = true;
        results.replaceChildren();
    }
}

function updateGamemode(dt: number): void {
    if (!activeState || !activePackage) return;
    const player = activeState.players.get('local');
    if (player) copyLocalIntoSnapshot(player);
    if (activePackage.params.type === 'parkour') applyParkourPlatformGrounding(activePackage.params.platforms ?? []);
    sampleRun(dt);
    updateCheckpointVisuals();
    updateStatus();
    if (activeState.ended && !resultsVisible) showResults('finish');
}

function buildGamemodeMeshes(pkg: GamemodePackageDefinition): THREE.Group {
    const root = new THREE.Group();
    const gateMaterial = new THREE.MeshBasicMaterial({ color: 0x80ff72, wireframe: true, transparent: true, opacity: 0.7 });
    const inactiveMaterial = new THREE.MeshBasicMaterial({ color: 0xa0c4ff, wireframe: true, transparent: true, opacity: 0.35 });
    for (const checkpoint of orderedCheckpoints(pkg.params)) {
        const geometry = new THREE.TorusGeometry(checkpoint.radius, 0.65, 8, 40);
        const mesh = new THREE.Mesh(geometry, checkpoint.order === 0 ? gateMaterial.clone() : inactiveMaterial.clone());
        mesh.position.set(checkpoint.position.x, checkpoint.position.y, checkpoint.position.z);
        mesh.rotation.y = Math.PI / 2;
        mesh.userData.checkpointId = checkpoint.id;
        root.add(mesh);
    }
    if (pkg.params.platforms) {
        const material = new THREE.MeshStandardMaterial({ color: 0x6c63ff, roughness: 0.7, metalness: 0.15 });
        for (const platform of pkg.params.platforms) {
            const geometry = new THREE.BoxGeometry(platform.size.x, platform.size.y, platform.size.z);
            const mesh = new THREE.Mesh(geometry, material.clone());
            mesh.position.set(platform.position.x, platform.position.y, platform.position.z);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            root.add(mesh);
        }
    }
    return root;
}

function updateCheckpointVisuals(): void {
    if (!checkpointRoot || !activeState || !activePackage) return;
    const progress = activeState.progress.get('local');
    if (!progress) return;
    const checkpoints = orderedCheckpoints(activePackage.params);
    const active = checkpoints[progress.nextCheckpointIndex];
    checkpointRoot.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        if (!('checkpointId' in object.userData)) return;
        const material = object.material;
        if (Array.isArray(material)) return;
        material.color.set(object.userData.checkpointId === active?.id ? 0x80ff72 : 0xa0c4ff);
        material.opacity = object.userData.checkpointId === active?.id ? 0.8 : 0.25;
    });
}

function applyParkourPlatformGrounding(platforms: PlatformDefinition[]): void {
    const parts = runtimeParts();
    if (!parts) return;
    const { playerGroup, runtime } = parts;
    const { physics } = runtime;
    for (const platform of platforms) {
        const halfX = platform.size.x / 2;
        const halfZ = platform.size.z / 2;
        const top = platform.position.y + platform.size.y / 2 + groundClearance;
        const insideX = Math.abs(playerGroup.position.x - platform.position.x) <= halfX;
        const insideZ = Math.abs(playerGroup.position.z - platform.position.z) <= halfZ;
        if (insideX && insideZ && playerGroup.position.y <= top + 4 && physics.velocity.y <= 0) {
            playerGroup.position.y = top;
            physics.velocity.y = 0;
            physics.isGrounded = true;
        }
    }
}

function sampleRun(dt: number): void {
    if (!activeState || !activePackage) return;
    const parts = runtimeParts();
    if (!parts) return;
    const { playerGroup, runtime } = parts;
    const { physics } = runtime;
    lastSampleMs += dt * 1000;
    if (lastSampleMs < 100) return;
    lastSampleMs = 0;
    samples.push({ t: Math.round(activeState.elapsedMs), x: playerGroup.position.x, y: playerGroup.position.y, z: playerGroup.position.z, speed: physics.speed });
    if (samples.length >= 50) flushRunSamples('sample');
}

function flushRunSamples(reason: 'sample' | 'finish' | 'abandon'): void {
    if (!activePackage || samples.length === 0) return;
    const payload = {
        channel: 'gamemode',
        type: 'run_sample',
        gamemodeId: activePackage.manifest.id,
        playerId: 'local',
        reason,
        samples,
    };
    if (sampleSocket?.readyState === WebSocket.OPEN) sampleSocket.send(JSON.stringify(payload));
    samples = [];
}

function openSampleSocket(): void {
    if (sampleSocket && sampleSocket.readyState <= WebSocket.OPEN) return;
    const url = new URL(window.location.href);
    const explicit = url.searchParams.get('ws');
    const target = explicit || (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? `ws://${window.location.hostname}:3001` : null);
    if (!target) return;
    sampleSocket = new WebSocket(target);
}

function showResults(reason: 'finish' | 'ended'): void {
    if (!activeState || !activePackage) return;
    resultsVisible = true;
    flushRunSamples(reason === 'finish' ? 'finish' : 'abandon');
    const result = activeState.results.find(entry => entry.playerId === 'local');
    const progress = activeState.progress.get('local');
    const elapsed = formatTime(progress?.finishedAtMs ?? activeState.elapsedMs);
    const bestLap = result?.bestLapMs ? formatTime(result.bestLapMs) : '—';
    const results = document.getElementById('gamemode-results');
    if (!results) return;
    results.hidden = false;
    const outcome = reason === 'finish' ? `Finished in ${elapsed}` : `Run ended at ${elapsed}`;
    const telemetry = reason === 'finish'
        ? '<div id="gamemode-leaderboard" class="gamemode-leaderboard">Loading unverified run telemetry…</div>'
        : '<div class="gamemode-leaderboard">Practice result · not submitted to the leaderboard</div>';
    results.innerHTML = `<h2 class="lp-panel-title">${activePackage.manifest.displayName}</h2><p>${outcome}</p><p>Score ${result?.score ?? 0}</p><p>Best lap ${bestLap}</p>${telemetry}<button class="lp-button" type="button" id="gamemode-close-results">Close</button>`;
    const closeButton = document.getElementById('gamemode-close-results');
    closeButton?.addEventListener('click', () => { results.hidden = true; });
    closeButton?.focus();
    if (reason === 'finish') void loadLeaderboard(activePackage.manifest.id);
}

async function loadLeaderboard(gamemodeId: string): Promise<void> {
    const target = document.getElementById('gamemode-leaderboard');
    if (!target) return;
    try {
        const response = await fetch(`${getApiBaseUrl()}/leaderboard/${encodeURIComponent(gamemodeId)}`);
        const payload = await response.json();
        if (!response.ok || !isLeaderboardPayload(payload)) throw new Error('leaderboard unavailable');
        if (payload.entries.length === 0) {
            target.textContent = 'No unverified run telemetry yet.';
            return;
        }
        target.innerHTML = `<p>Unverified client telemetry · no rewards or ranked authority</p><ol>${payload.entries.map(entry => `<li><span>${escapeHtml(entry.playerId)}</span><strong>${formatTime(entry.bestTimeMs)}</strong></li>`).join('')}</ol>`;
    } catch (error) {
        target.textContent = error instanceof Error ? error.message : 'leaderboard unavailable';
    }
}

function isLeaderboardPayload(value: unknown): value is {
    entries: Array<{ playerId: string; bestTimeMs: number }>;
    trust: 'untrusted_client_telemetry';
    rewardEligible: false;
    rankedEligible: false;
} {
    if (!value || typeof value !== 'object' || !('entries' in value) || !Array.isArray(value.entries)) return false;
    if (!('trust' in value) || value.trust !== 'untrusted_client_telemetry') return false;
    if (!('rewardEligible' in value) || value.rewardEligible !== false) return false;
    if (!('rankedEligible' in value) || value.rankedEligible !== false) return false;
    return value.entries.every(entry => !!entry && typeof entry === 'object' && 'playerId' in entry && typeof entry.playerId === 'string' && 'bestTimeMs' in entry && typeof entry.bestTimeMs === 'number');
}

function updateStatus(): void {
    const status = document.getElementById('gamemode-status');
    const endButton = document.getElementById('gamemode-end-run');
    if (!status || !activeState || !activePackage) {
        if (status) status.hidden = true;
        if (endButton) endButton.hidden = true;
        return;
    }
    status.hidden = false;
    if (endButton) endButton.hidden = false;
    const progress = activeState.progress.get('local');
    const score = activeState.scores.get('local') ?? 0;
    const total = activePackage.params.checkpoints.length;
    const next = progress ? progress.nextCheckpointIndex + 1 : 1;
    status.textContent = `${activePackage.manifest.displayName}: gate ${next}/${total} lap ${progress?.lap ?? 0} score ${score} time ${formatTime(activeState.elapsedMs)}`;
}

function localPlayerSnapshot(): PlayerSnapshot {
    const parts = runtimeParts();
    if (!parts) throw new Error('game runtime is not ready');
    const { runtime, playerGroup, skateboard } = parts;
    const { physics } = runtime;
    const state = buildLocalSnapshot(playerGroup, physics.heading, physics.speed, physics.isGrounded, skateboard.rotation.x, skateboard.rotation.z);
    return { id: 'local', name: 'Local Pup', color: 0xffb703, ...state };
}

function copyLocalIntoSnapshot(player: PlayerSnapshot): void {
    const snapshot = localPlayerSnapshot();
    player.x = snapshot.x;
    player.y = snapshot.y;
    player.z = snapshot.z;
    player.qx = snapshot.qx;
    player.qy = snapshot.qy;
    player.qz = snapshot.qz;
    player.qw = snapshot.qw;
    player.heading = snapshot.heading;
    player.speed = snapshot.speed;
    player.isGrounded = snapshot.isGrounded;
    player.boardTiltX = snapshot.boardTiltX;
    player.boardTiltZ = snapshot.boardTiltZ;
}

function escapeHtml(value: string): string {
    return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function formatTime(ms: number): string {
    const seconds = ms / 1000;
    return `${seconds.toFixed(2)}s`;
}
