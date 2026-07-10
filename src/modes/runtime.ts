import type { Gamemode, GamemodeContext, GamemodeRuntimeState, CheckpointDefinition } from '../contracts/gamemode.ts';
import type { PackageManifest } from '../contracts/packageManifest.ts';
import { validatePackageManifest } from '../contracts/packageManifest.ts';
import type { PlayerSnapshot } from '../net/protocol.ts';

export type GamemodeType = 'race' | 'parkour';

export interface GamemodePackageDefinition {
    manifest: PackageManifest;
    params: GamemodeParams;
}

export interface GamemodeParams {
    type: GamemodeType;
    laps?: number;
    timeLimitMs?: number;
    checkpoints: CheckpointDefinition[];
    startPosition: { x: number; y: number; z: number };
    platforms?: PlatformDefinition[];
    fallY?: number;
}

export interface PlatformDefinition {
    id: string;
    position: { x: number; y: number; z: number };
    size: { x: number; y: number; z: number };
}

export interface PlayerProgress {
    nextCheckpointIndex: number;
    completedCheckpoints: number;
    lap: number;
    bestLapMs?: number;
    lapStartedAtMs: number;
    finishedAtMs?: number;
    lastCheckpointId?: string;
    lastCheckpointPosition: { x: number; y: number; z: number };
    falls: number;
}

export interface GamemodeResult {
    playerId: string;
    score: number;
    completedAtMs?: number;
    bestLapMs?: number;
    falls: number;
}

export interface ScoreBreakdown {
    completionBonus: number;
    checkpointScore: number;
    lapScore: number;
    timePenalty: number;
    fallPenalty: number;
    total: number;
}

export interface RuntimeGamemodeState extends GamemodeRuntimeState {
    params: GamemodeParams;
    progress: Map<string, PlayerProgress>;
    results: GamemodeResult[];
    startedAtMs: number;
    ended: boolean;
}

export interface GamemodeRuntimeEvent {
    type: 'checkpoint' | 'lap' | 'finish' | 'fall' | 'reset';
    playerId: string;
    checkpointId?: string;
    elapsedMs: number;
    score: number;
}

const emptyPlayerSnapshot: PlayerSnapshot = {
    id: 'local',
    name: 'Local Pup',
    color: 0xffb703,
    x: 0,
    y: 0,
    z: 0,
    qx: 0,
    qy: 0,
    qz: 0,
    qw: 1,
    heading: 0,
    speed: 0,
    isGrounded: true,
    boardTiltX: 0,
    boardTiltZ: 0,
};

export function validateGamemodePackage(pkg: GamemodePackageDefinition): GamemodePackageDefinition {
    const manifest = validatePackageManifest(pkg.manifest);
    if (!manifest.ok) throw new Error(manifest.error);
    if (manifest.value.kind !== 'gamemode') throw new Error('manifest kind must be gamemode');
    validateGamemodeParams(pkg.params);
    return { manifest: manifest.value, params: pkg.params };
}

export function validateGamemodeParams(params: GamemodeParams): void {
    if (params.type !== 'race' && params.type !== 'parkour') throw new Error('gamemode type must be race or parkour');
    if (!Array.isArray(params.checkpoints) || params.checkpoints.length === 0) throw new Error('gamemode requires checkpoints');
    const ids = new Set<string>();
    for (const checkpoint of params.checkpoints) {
        if (!checkpoint.id) throw new Error('checkpoint id is required');
        if (ids.has(checkpoint.id)) throw new Error(`duplicate checkpoint id ${checkpoint.id}`);
        ids.add(checkpoint.id);
        if (!(checkpoint.radius > 0)) throw new Error(`checkpoint ${checkpoint.id} radius must be positive`);
    }
    if (params.type === 'race' && (!Number.isInteger(params.laps) || (params.laps ?? 0) < 1)) throw new Error('race laps must be a positive integer');
    if (params.type === 'parkour' && (!params.platforms || params.platforms.length === 0)) throw new Error('parkour requires platforms');
}

export function createRuntimeState(params: GamemodeParams, localPlayer: PlayerSnapshot = emptyPlayerSnapshot): RuntimeGamemodeState {
    const state: RuntimeGamemodeState = {
        players: new Map([[localPlayer.id, localPlayer]]),
        scores: new Map([[localPlayer.id, 0]]),
        checkpoints: params.checkpoints,
        elapsedMs: 0,
        params,
        progress: new Map(),
        results: [],
        startedAtMs: 0,
        ended: false,
    };
    state.progress.set(localPlayer.id, createInitialProgress(params));
    return state;
}

export function createGamemode(pkg: GamemodePackageDefinition, onEvent?: (event: GamemodeRuntimeEvent) => void): Gamemode {
    const valid = validateGamemodePackage(pkg);
    let context: GamemodeContext | null = null;
    const params = valid.params;

    function emit(state: RuntimeGamemodeState, event: Omit<GamemodeRuntimeEvent, 'elapsedMs' | 'score'>) {
        const full = { ...event, elapsedMs: state.elapsedMs, score: state.scores.get(event.playerId) ?? 0 };
        context?.broadcast({ channel: 'gamemode', gamemodeId: valid.manifest.id, ...full });
        onEvent?.(full);
    }

    return {
        id: valid.manifest.id,
        checkpoints: params.checkpoints,
        init(nextContext) {
            context = nextContext;
        },
        start(state) {
            const runtime = asRuntimeState(state);
            runtime.startedAtMs = context?.now() ?? Date.now();
            for (const player of runtime.players.values()) ensureProgress(runtime, player.id);
        },
        tick(_dt, state) {
            const runtime = asRuntimeState(state);
            if (runtime.ended) return;
            for (const player of runtime.players.values()) {
                ensureProgress(runtime, player.id);
                if (params.type === 'parkour') maybeResetFallenPlayer(runtime, player, emit);
                processCheckpoint(runtime, player, emit);
            }
            if (this.isWinConditionMet(runtime)) {
                runtime.ended = true;
                void this.end(runtime);
            }
        },
        end(state) {
            const runtime = asRuntimeState(state);
            runtime.results = [...runtime.progress.entries()]
                .map(([playerId, progress]) => ({
                    playerId,
                    score: runtime.scores.get(playerId) ?? 0,
                    completedAtMs: progress.finishedAtMs,
                    bestLapMs: progress.bestLapMs,
                    falls: progress.falls,
                }))
                .sort((a, b) => b.score - a.score || (a.completedAtMs ?? Number.MAX_SAFE_INTEGER) - (b.completedAtMs ?? Number.MAX_SAFE_INTEGER));
        },
        onPlayerJoin(player, state) {
            const runtime = asRuntimeState(state);
            runtime.players.set(player.id, player);
            runtime.scores.set(player.id, 0);
            runtime.progress.set(player.id, createInitialProgress(params));
        },
        onPlayerLeave(playerId, state) {
            const runtime = asRuntimeState(state);
            runtime.players.delete(playerId);
        },
        score(playerId, state) {
            return state.scores.get(playerId) ?? 0;
        },
        isWinConditionMet(state) {
            const runtime = asRuntimeState(state);
            if (runtime.progress.size === 0) return false;
            for (const progress of runtime.progress.values()) {
                if (progress.finishedAtMs !== undefined) return true;
            }
            return params.timeLimitMs !== undefined && runtime.elapsedMs >= params.timeLimitMs;
        },
    };
}

export function createInitialProgress(params: GamemodeParams): PlayerProgress {
    return {
        nextCheckpointIndex: 0,
        completedCheckpoints: 0,
        lap: 0,
        lapStartedAtMs: 0,
        lastCheckpointPosition: params.startPosition,
        falls: 0,
    };
}

export function orderedCheckpoints(params: GamemodeParams): CheckpointDefinition[] {
    return [...params.checkpoints].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export function processCheckpoint(
    state: RuntimeGamemodeState,
    player: PlayerSnapshot,
    emit?: (state: RuntimeGamemodeState, event: Omit<GamemodeRuntimeEvent, 'elapsedMs' | 'score'>) => void,
): boolean {
    const checkpoints = orderedCheckpoints(state.params);
    const progress = ensureProgress(state, player.id);
    if (progress.finishedAtMs !== undefined) return false;
    const checkpoint = checkpoints[progress.nextCheckpointIndex];
    if (!checkpoint || !isInsideCheckpoint(player, checkpoint)) return false;

    progress.completedCheckpoints += 1;
    progress.nextCheckpointIndex += 1;
    progress.lastCheckpointId = checkpoint.id;
    progress.lastCheckpointPosition = checkpoint.position;
    state.scores.set(player.id, calculateScore(state.params, progress, state.elapsedMs));
    emit?.(state, { type: 'checkpoint', playerId: player.id, checkpointId: checkpoint.id });

    if (progress.nextCheckpointIndex >= checkpoints.length) {
        progress.nextCheckpointIndex = 0;
        progress.lap += 1;
        const lapMs = state.elapsedMs - progress.lapStartedAtMs;
        progress.bestLapMs = Math.min(progress.bestLapMs ?? lapMs, lapMs);
        progress.lapStartedAtMs = state.elapsedMs;
        emit?.(state, { type: 'lap', playerId: player.id, checkpointId: checkpoint.id });
        const targetLaps = state.params.type === 'race' ? state.params.laps ?? 1 : 1;
        if (progress.lap >= targetLaps) {
            progress.finishedAtMs = state.elapsedMs;
            state.scores.set(player.id, calculateScore(state.params, progress, state.elapsedMs));
            emit?.(state, { type: 'finish', playerId: player.id, checkpointId: checkpoint.id });
        }
    }
    return true;
}

export function calculateScore(params: GamemodeParams, progress: PlayerProgress, elapsedMs: number): number {
    return calculateScoreBreakdown(params, progress, elapsedMs).total;
}

export function calculateScoreBreakdown(params: GamemodeParams, progress: PlayerProgress, elapsedMs: number): ScoreBreakdown {
    const completionBonus = progress.finishedAtMs !== undefined ? 100_000 : 0;
    const checkpointScore = progress.completedCheckpoints * 1_000;
    const lapScore = progress.lap * 5_000;
    const timePenalty = Math.floor(elapsedMs / 100);
    const fallPenalty = params.type === 'parkour' ? progress.falls * 500 : 0;
    return {
        completionBonus,
        checkpointScore,
        lapScore,
        timePenalty,
        fallPenalty,
        total: Math.max(0, completionBonus + checkpointScore + lapScore - timePenalty - fallPenalty),
    };
}

export function isInsideCheckpoint(player: PlayerSnapshot, checkpoint: CheckpointDefinition): boolean {
    const dx = player.x - checkpoint.position.x;
    const dy = player.y - checkpoint.position.y;
    const dz = player.z - checkpoint.position.z;
    return dx * dx + dy * dy + dz * dz <= checkpoint.radius * checkpoint.radius;
}

export function maybeResetFallenPlayer(
    state: RuntimeGamemodeState,
    player: PlayerSnapshot,
    emit?: (state: RuntimeGamemodeState, event: Omit<GamemodeRuntimeEvent, 'elapsedMs' | 'score'>) => void,
): boolean {
    const fallY = state.params.fallY ?? -20;
    if (player.y >= fallY) return false;
    const progress = ensureProgress(state, player.id);
    progress.falls += 1;
    player.x = progress.lastCheckpointPosition.x;
    player.y = progress.lastCheckpointPosition.y;
    player.z = progress.lastCheckpointPosition.z;
    state.scores.set(player.id, calculateScore(state.params, progress, state.elapsedMs));
    emit?.(state, { type: 'fall', playerId: player.id, checkpointId: progress.lastCheckpointId });
    return true;
}

function ensureProgress(state: RuntimeGamemodeState, playerId: string): PlayerProgress {
    let progress = state.progress.get(playerId);
    if (!progress) {
        progress = createInitialProgress(state.params);
        state.progress.set(playerId, progress);
    }
    return progress;
}

function asRuntimeState(state: GamemodeRuntimeState): RuntimeGamemodeState {
    if (isRuntimeState(state)) return state;
    throw new Error('gamemode state was not created by createRuntimeState');
}

function isRuntimeState(state: GamemodeRuntimeState): state is RuntimeGamemodeState {
    return 'params' in state
        && 'progress' in state
        && state.progress instanceof Map
        && 'results' in state
        && Array.isArray(state.results)
        && 'startedAtMs' in state
        && typeof state.startedAtMs === 'number'
        && 'ended' in state
        && typeof state.ended === 'boolean';
}
