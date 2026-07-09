import * as THREE from 'three';
import { gamemodePackages } from '../../content/gamemodes/index.ts';
import { groundClearance } from '../config.ts';
import type { GamemodePackageDefinition, PlatformDefinition, RuntimeGamemodeState } from './runtime.ts';
import { createGamemode, createRuntimeState, orderedCheckpoints, validateGamemodePackage } from './runtime.ts';
import { registerUpdateHook, setCurrentGamemode } from '../game/loop.ts';
import { getTerrainHeight } from '../game/terrain.ts';
import { physics, playerGroup, scene, skateboard } from '../state.ts';
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

export function setupGamemodeUI(): void {
    const packages = gamemodePackages.map(pkg => validateGamemodePackage(pkg));
    const panel = document.createElement('div');
    panel.id = 'gamemode-panel';
    panel.className = 'lp-panel lp-gameplay';
    panel.innerHTML = `<h2 class="lp-panel-title">Gamemodes</h2><div id="gamemode-buttons"></div><div id="gamemode-status">Free skate</div>`;
    document.body.appendChild(panel);
    const buttons = document.getElementById('gamemode-buttons');
    if (!buttons) return;
    for (const pkg of packages) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = pkg.manifest.displayName;
        button.addEventListener('click', () => startGamemode(pkg));
        buttons.appendChild(button);
    }
    const results = document.createElement('div');
    results.id = 'gamemode-results';
    results.className = 'lp-panel lp-panel-strong lp-gameplay';
    results.hidden = true;
}

export function startGamemode(pkg: GamemodePackageDefinition): void {
    stopGamemode();
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
        if (event.type === 'finish') showResults();
    });
    void gamemode.init({ roomId: 'local', now: () => performance.now(), broadcast: () => undefined });
    void gamemode.start(activeState);
    setCurrentGamemode(gamemode, activeState);
    checkpointRoot = buildGamemodeMeshes(activePackage);
    scene.add(checkpointRoot);
    samples = [];
    lastSampleMs = 0;
    resultsVisible = false;
    openSampleSocket();
    unregisterHook = registerUpdateHook((dt) => updateGamemode(dt));
    updateStatus();
}

export function stopGamemode(): void {
    if (unregisterHook) unregisterHook();
    unregisterHook = null;
    setCurrentGamemode(null);
    if (checkpointRoot) {
        scene.remove(checkpointRoot);
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
    activeState = null;
    activePackage = null;
}

function updateGamemode(dt: number): void {
    if (!activeState || !activePackage) return;
    const player = activeState.players.get('local');
    if (player) copyLocalIntoSnapshot(player);
    if (activePackage.params.type === 'parkour') applyParkourPlatformGrounding(activePackage.params.platforms ?? []);
    sampleRun(dt);
    updateCheckpointVisuals();
    updateStatus();
    if (activeState.ended && !resultsVisible) showResults();
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

function showResults(): void {
    if (!activeState || !activePackage) return;
    resultsVisible = true;
    flushRunSamples('finish');
    const result = activeState.results.find(entry => entry.playerId === 'local');
    const progress = activeState.progress.get('local');
    const elapsed = formatTime(progress?.finishedAtMs ?? activeState.elapsedMs);
    const bestLap = result?.bestLapMs ? formatTime(result.bestLapMs) : '—';
    const results = document.getElementById('gamemode-results');
    if (!results) return;
    results.hidden = false;
    results.innerHTML = `<h2 class="lp-panel-title">${activePackage.manifest.displayName}</h2><p>Finished in ${elapsed}</p><p>Score ${result?.score ?? 0}</p><p>Best lap ${bestLap}</p><div id="gamemode-leaderboard" class="gamemode-leaderboard">Loading leaderboard…</div><button class="lp-button" type="button" id="gamemode-close-results">Close</button>`;
    document.getElementById('gamemode-close-results')?.addEventListener('click', () => { results.hidden = true; });
    void loadLeaderboard(activePackage.manifest.id);
}

async function loadLeaderboard(gamemodeId: string): Promise<void> {
    const target = document.getElementById('gamemode-leaderboard');
    if (!target) return;
    try {
        const response = await fetch(`${getApiBaseUrl()}/leaderboard/${encodeURIComponent(gamemodeId)}`);
        const payload = await response.json();
        if (!response.ok || !isLeaderboardPayload(payload)) throw new Error('leaderboard unavailable');
        if (payload.entries.length === 0) {
            target.textContent = 'No leaderboard runs yet.';
            return;
        }
        target.innerHTML = `<ol>${payload.entries.map(entry => `<li><span>${escapeHtml(entry.playerId)}</span><strong>${formatTime(entry.bestTimeMs)}</strong></li>`).join('')}</ol>`;
    } catch (error) {
        target.textContent = error instanceof Error ? error.message : 'leaderboard unavailable';
    }
}

function isLeaderboardPayload(value: unknown): value is { entries: Array<{ playerId: string; bestTimeMs: number }> } {
    if (!value || typeof value !== 'object' || !('entries' in value) || !Array.isArray(value.entries)) return false;
    return value.entries.every(entry => !!entry && typeof entry === 'object' && 'playerId' in entry && typeof entry.playerId === 'string' && 'bestTimeMs' in entry && typeof entry.bestTimeMs === 'number');
}

function updateStatus(): void {
    const status = document.getElementById('gamemode-status');
    if (!status || !activeState || !activePackage) {
        if (status) status.textContent = 'Free skate';
        return;
    }
    const progress = activeState.progress.get('local');
    const score = activeState.scores.get('local') ?? 0;
    const total = activePackage.params.checkpoints.length;
    const next = progress ? progress.nextCheckpointIndex + 1 : 1;
    status.textContent = `${activePackage.manifest.displayName}: gate ${next}/${total} lap ${progress?.lap ?? 0} score ${score} time ${formatTime(activeState.elapsedMs)}`;
}

function localPlayerSnapshot(): PlayerSnapshot {
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
