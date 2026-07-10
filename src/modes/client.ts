import * as THREE from 'three';
import { groundClearance } from '../config.ts';
import type { GamemodePackageDefinition, PlatformDefinition, RuntimeGamemodeState, ScoreBreakdown } from './runtime.ts';
import { calculateScoreBreakdown, createGamemode, createRuntimeState, orderedCheckpoints, validateGamemodePackage } from './runtime.ts';
import { getActiveRuntime, getRuntimeScene, registerUpdateHook, setCurrentGamemode } from '../game/runtimeRegistry.ts';
import { getTerrainHeight } from '../game/terrain.ts';
import { buildLocalSnapshot } from '../game/multiplayer.ts';
import { getApiBaseUrl, type PlayerSnapshot } from '../net/protocol.ts';
import { createReplayRunState, reduceReplayRun, type ReplayRunEvent } from './replayRun.ts';

interface RunSample {
    t: number;
    x: number;
    y: number;
    z: number;
    speed: number;
}

export interface GamemodeHudBinding {
    root: HTMLElement;
    modeName: HTMLElement;
    checkpoint: HTMLElement;
    checkpointTotal: HTMLElement;
    lap: HTMLElement;
    lapTotal: HTMLElement;
    score: HTMLElement;
    time: HTMLElement;
    announcement: HTMLElement;
}

export interface PracticeLeaderboardEntry {
    playerId: string;
    bestTimeMs: number;
}

export type LeaderboardView =
    | { status: 'practice' }
    | { status: 'loading' }
    | { status: 'empty' }
    | { status: 'ready'; entries: PracticeLeaderboardEntry[] }
    | { status: 'error' };

export interface PersonalBestView {
    previousScore: number | null;
    isNew: boolean;
}

export interface GamemodeResultView {
    reason: 'finish' | 'ended';
    modeId: string;
    modeName: string;
    elapsedMs: number;
    bestLapMs?: number;
    score: number;
    breakdown: ScoreBreakdown;
    personalBest: PersonalBestView;
    leaderboard: LeaderboardView;
}

export interface GamemodePresentation {
    active: boolean;
    result: GamemodeResultView | null;
}

const IDLE_PRESENTATION: GamemodePresentation = { active: false, result: null };

let activeState: RuntimeGamemodeState | null = null;
let activePackage: GamemodePackageDefinition | null = null;
let unregisterHook: (() => void) | null = null;
let checkpointRoot: THREE.Group | null = null;
let sampleSocket: WebSocket | null = null;
let lastSampleMs = 0;
let samples: RunSample[] = [];
let resultsVisible = false;
let hudBinding: GamemodeHudBinding | null = null;
let lastRunPackage: GamemodePackageDefinition | null = null;
let presentation: GamemodePresentation = IDLE_PRESENTATION;
let replayRun = createReplayRunState();
const presentationListeners = new Set<() => void>();

export function getGamemodePresentation(): GamemodePresentation {
    return presentation;
}

export function subscribeGamemodePresentation(listener: () => void): () => void {
    presentationListeners.add(listener);
    return () => presentationListeners.delete(listener);
}

function publishPresentation(next: GamemodePresentation): void {
    if (presentation === next) return;
    presentation = next;
    for (const listener of presentationListeners) listener();
}

export function bindGamemodeHud(binding: GamemodeHudBinding): () => void {
    hudBinding = binding;
    updateStatus();
    return () => {
        if (hudBinding === binding) hudBinding = null;
    };
}

export function getReplayRunEvents(): readonly ReplayRunEvent[] {
    return replayRun.events;
}

function runtimeParts() {
    const runtime = getActiveRuntime();
    const playerGroup = runtime?.parts?.playerGroup ?? runtime?.parts?.group;
    const skateboard = runtime?.parts?.skateboard;
    const scene = getRuntimeScene();
    if (!runtime || !playerGroup || !skateboard || !scene) return null;
    return { runtime, playerGroup, skateboard, scene };
}

export function startGamemode(pkg: GamemodePackageDefinition): void {
    startGamemodeAttempt(pkg, false);
}

function startGamemodeAttempt(pkg: GamemodePackageDefinition, replayAlreadyStarted: boolean): void {
    stopGamemode();
    const parts = runtimeParts();
    if (!parts) return;
    const { runtime, playerGroup, scene } = parts;
    const { physics } = runtime;
    activePackage = validateGamemodePackage(pkg);
    lastRunPackage = activePackage;
    if (!replayAlreadyStarted) replayRun = reduceReplayRun(replayRun, { type: 'START' });
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
        if (event.type === 'finish') completeGamemode('finish');
    });
    void gamemode.init({ roomId: 'local', now: () => performance.now(), broadcast: () => undefined });
    void gamemode.start(activeState);
    setCurrentGamemode(gamemode, activeState);
    checkpointRoot = buildGamemodeMeshes(activePackage);
    scene.add(checkpointRoot);
    samples = [];
    lastSampleMs = 0;
    resultsVisible = false;
    publishPresentation({ active: true, result: null });
    openSampleSocket();
    unregisterHook = registerUpdateHook((dt) => updateGamemode(dt));
    updateStatus();
}

export function stopGamemode(options: { preserveResults?: boolean } = {}): void {
    if (activeState && replayRun.phase === 'running') {
        replayRun = reduceReplayRun(replayRun, { type: 'ABANDON', atMs: activeState.elapsedMs });
    }
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
    publishPresentation({
        active: false,
        result: options.preserveResults ? presentation.result : null,
    });
}

export function endGamemode(): void {
    if (!activeState || !activePackage) return;
    completeGamemode('ended');
}

export function retryGamemode(): void {
    const pkg = lastRunPackage;
    if (!pkg || replayRun.phase !== 'results') return;
    replayRun = reduceReplayRun(replayRun, { type: 'RETRY', atMs: presentation.result?.elapsedMs ?? 0 });
    startGamemodeAttempt(pkg, true);
}

export function dismissGamemodeResults(): void {
    if (!presentation.result) return;
    publishPresentation({ active: false, result: null });
    window.requestAnimationFrame(() => document.getElementById('menu-button')?.focus({ preventScroll: true }));
}

export function retryLeaderboard(): void {
    const result = presentation.result;
    if (!result || result.reason !== 'finish') return;
    publishPresentation({ active: false, result: { ...result, leaderboard: { status: 'loading' } } });
    void loadLeaderboard(result.modeId);
}

export function disposeGamemodeUI(): void {
    stopGamemode();
    presentation = IDLE_PRESENTATION;
}

function updateGamemode(dt: number): void {
    if (!activeState || !activePackage) return;
    const player = activeState.players.get('local');
    if (player) copyLocalIntoSnapshot(player);
    if (activePackage.params.type === 'parkour') applyParkourPlatformGrounding(activePackage.params.platforms ?? []);
    sampleRun(dt);
    updateCheckpointVisuals();
    updateStatus();
    if (activeState.ended && !resultsVisible) completeGamemode('finish');
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

export function recordReplayMeaningfulInput(): void {
    if (!activeState || replayRun.phase !== 'running') return;
    replayRun = reduceReplayRun(replayRun, { type: 'MEANINGFUL_INPUT', atMs: activeState.elapsedMs });
}

export function recordReplaySkillBeat(): void {
    if (!activeState || replayRun.phase !== 'running') return;
    replayRun = reduceReplayRun(replayRun, { type: 'SKILL_BEAT', atMs: activeState.elapsedMs });
}

function completeGamemode(reason: 'finish' | 'ended'): void {
    if (!activeState || !activePackage || resultsVisible) return;
    resultsVisible = true;
    const state = activeState;
    const pkg = activePackage;
    const progress = state.progress.get('local');
    if (!progress) return;
    const elapsedMs = progress.finishedAtMs ?? state.elapsedMs;
    replayRun = reduceReplayRun(replayRun, {
        type: reason === 'finish' ? 'FINISH' : 'ABANDON',
        atMs: elapsedMs,
    });
    replayRun = reduceReplayRun(replayRun, { type: 'SHOW_RESULT', atMs: elapsedMs });
    flushRunSamples(reason === 'finish' ? 'finish' : 'abandon');
    const breakdown = calculateScoreBreakdown(pkg.params, progress, elapsedMs);
    const personalBest = updatePersonalBest(pkg.manifest.id, breakdown.total, reason === 'finish');
    const result: GamemodeResultView = {
        reason,
        modeId: pkg.manifest.id,
        modeName: pkg.manifest.displayName,
        elapsedMs,
        bestLapMs: progress.bestLapMs,
        score: breakdown.total,
        breakdown,
        personalBest,
        leaderboard: reason === 'finish' ? { status: 'loading' } : { status: 'practice' },
    };
    publishPresentation({ active: false, result });
    stopGamemode({ preserveResults: true });
    if (reason === 'finish') void loadLeaderboard(pkg.manifest.id);
}

async function loadLeaderboard(gamemodeId: string): Promise<void> {
    try {
        const response = await fetch(`${getApiBaseUrl()}/leaderboard/${encodeURIComponent(gamemodeId)}`);
        const payload = await response.json();
        if (!response.ok || !isLeaderboardPayload(payload)) throw new Error('leaderboard unavailable');
        const result = presentation.result;
        if (!result || result.modeId !== gamemodeId) return;
        const leaderboard: LeaderboardView = payload.entries.length === 0
            ? { status: 'empty' }
            : { status: 'ready', entries: payload.entries };
        publishPresentation({ active: false, result: { ...result, leaderboard } });
    } catch {
        const result = presentation.result;
        if (!result || result.modeId !== gamemodeId) return;
        publishPresentation({ active: false, result: { ...result, leaderboard: { status: 'error' } } });
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
    const binding = hudBinding;
    if (!binding) return;
    if (!activeState || !activePackage) {
        binding.root.hidden = true;
        return;
    }
    binding.root.hidden = false;
    const progress = activeState.progress.get('local');
    if (!progress) return;
    const score = calculateScoreBreakdown(activePackage.params, progress, activeState.elapsedMs).total;
    const total = activePackage.params.checkpoints.length;
    const next = progress.nextCheckpointIndex + 1;
    const lapTotal = activePackage.params.laps ?? 1;
    const lap = Math.min(progress.lap + 1, lapTotal);
    binding.modeName.textContent = activePackage.manifest.displayName;
    binding.checkpoint.textContent = String(next);
    binding.checkpointTotal.textContent = String(total);
    binding.lap.textContent = String(lap);
    binding.lapTotal.textContent = String(lapTotal);
    binding.score.textContent = score.toLocaleString();
    binding.time.textContent = formatRunTime(activeState.elapsedMs);
    const progressKey = `${progress.completedCheckpoints}:${progress.lap}`;
    if (binding.announcement.dataset.progressKey !== progressKey) {
        binding.announcement.dataset.progressKey = progressKey;
        binding.announcement.textContent = progress.completedCheckpoints === 0
            ? `${activePackage.manifest.displayName} started. Gate one of ${total}.`
            : `Gate ${Math.min(progress.completedCheckpoints, total)} cleared. Next gate ${next} of ${total}.`;
    }
}

function updatePersonalBest(modeId: string, score: number, eligible: boolean): PersonalBestView {
    let previousScore: number | null = null;
    try {
        const stored = window.localStorage.getItem(`lunarpup:practice-best:${modeId}`);
        const parsed = stored === null ? Number.NaN : Number(stored);
        previousScore = Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
        if (eligible && (previousScore === null || score > previousScore)) {
            window.localStorage.setItem(`lunarpup:practice-best:${modeId}`, String(score));
        }
    } catch {
        // Personal-best context is optional when storage is unavailable.
    }
    return { previousScore, isNew: eligible && (previousScore === null || score > previousScore) };
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

export function formatRunTime(ms: number): string {
    const seconds = ms / 1000;
    return `${seconds.toFixed(2)}s`;
}
