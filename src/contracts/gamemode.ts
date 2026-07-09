import type { PlayerSnapshot } from '../net/protocol.ts';
import { fail, isRecord, ok, readArray, readNumber, readString, type ValidationResult, type Validator } from './validators.ts';

export interface CheckpointDefinition {
    id: string;
    position: { x: number; y: number; z: number };
    radius: number;
    order?: number;
}

export interface GamemodeRuntimeState {
    players: Map<string, PlayerSnapshot>;
    scores: Map<string, number>;
    checkpoints: CheckpointDefinition[];
    elapsedMs: number;
}

export interface GamemodeContext {
    roomId: string;
    now: () => number;
    broadcast: (message: unknown) => void;
}

export interface Gamemode {
    id: string;
    checkpoints: CheckpointDefinition[];
    init(context: GamemodeContext): void | Promise<void>;
    start(state: GamemodeRuntimeState): void | Promise<void>;
    tick(dt: number, state: GamemodeRuntimeState): void | Promise<void>;
    end(state: GamemodeRuntimeState): void | Promise<void>;
    onPlayerJoin(player: PlayerSnapshot, state: GamemodeRuntimeState): void | Promise<void>;
    onPlayerLeave(playerId: string, state: GamemodeRuntimeState): void | Promise<void>;
    score(playerId: string, state: GamemodeRuntimeState): number;
    isWinConditionMet(state: GamemodeRuntimeState): boolean;
}

function validatePosition(value: unknown, path: string): ValidationResult<{ x: number; y: number; z: number }> {
    if (!isRecord(value)) return fail(`${path} must be an object`);
    const x = readNumber(value, 'x', `${path}.x`);
    if (!x.ok) return x;
    const y = readNumber(value, 'y', `${path}.y`);
    if (!y.ok) return y;
    const z = readNumber(value, 'z', `${path}.z`);
    if (!z.ok) return z;
    return ok({ x: x.value, y: y.value, z: z.value });
}

const validateCheckpoint: Validator<CheckpointDefinition> = (value, path = 'checkpoint') => {
    if (!isRecord(value)) return fail(`${path} must be an object`);
    const id = readString(value, 'id', `${path}.id`);
    if (!id.ok) return id;
    const position = validatePosition(value.position, `${path}.position`);
    if (!position.ok) return position;
    const radius = readNumber(value, 'radius', `${path}.radius`);
    if (!radius.ok) return radius;
    const order = value.order === undefined ? undefined : readNumber(value, 'order', `${path}.order`);
    if (order && !order.ok) return order;
    return ok({ id: id.value, position: position.value, radius: radius.value, order: order?.value });
};

export function validateCheckpointDefinition(value: unknown): ValidationResult<CheckpointDefinition> {
    return validateCheckpoint(value, 'checkpoint');
}

export function validateCheckpointDefinitions(value: unknown): ValidationResult<CheckpointDefinition[]> {
    if (!isRecord({ checkpoints: value })) return fail('checkpoints must be an array');
    return readArray({ checkpoints: value }, 'checkpoints', validateCheckpoint);
}

export function isGamemode(value: unknown): value is Gamemode {
    if (!isRecord(value)) return false;
    return typeof value.id === 'string'
        && Array.isArray(value.checkpoints)
        && typeof value.init === 'function'
        && typeof value.start === 'function'
        && typeof value.tick === 'function'
        && typeof value.end === 'function'
        && typeof value.onPlayerJoin === 'function'
        && typeof value.onPlayerLeave === 'function'
        && typeof value.score === 'function'
        && typeof value.isWinConditionMet === 'function';
}
