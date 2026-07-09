import { fail, isRecord, ok, readArray, readEnum, readNumber, type ValidationResult, type Validator } from './validators.ts';

export const cosmeticSlots = ['board', 'body', 'trail', 'aura'] as const;
export type CosmeticSlot = (typeof cosmeticSlots)[number];

export const cosmeticRarities = ['common', 'rare', 'epic', 'legendary'] as const;
export type CosmeticRarity = (typeof cosmeticRarities)[number];

export interface MeshParams {
    shape: 'box' | 'sphere' | 'cylinder' | 'custom';
    scale: [number, number, number];
    roughness?: number;
    metalness?: number;
}

export interface ParticleParams {
    count: number;
    size: number;
    lifetime: number;
    emissionRate: number;
}

export interface CosmeticVisualSpec {
    colors: string[];
    mesh?: MeshParams;
    particles?: ParticleParams;
}

export interface CosmeticDefinition {
    id: string;
    slot: CosmeticSlot;
    visual: CosmeticVisualSpec;
    rarity: CosmeticRarity;
}

const meshShapes = ['box', 'sphere', 'cylinder', 'custom'] as const;
const colorPattern = /^#(?:[a-fA-F0-9]{6}|[a-fA-F0-9]{8})$/;

const validateColor: Validator<string> = (value, path = 'color') => {
    return typeof value === 'string' && colorPattern.test(value) ? ok(value) : fail(`${path} must be a #RRGGBB or #RRGGBBAA color`);
};

function validateTuple3(value: unknown, path: string): ValidationResult<[number, number, number]> {
    if (!Array.isArray(value) || value.length !== 3) return fail(`${path} must be a three-number tuple`);
    const [x, y, z] = value;
    if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number') return fail(`${path} must be a three-number tuple`);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return fail(`${path} values must be finite`);
    return ok([x, y, z]);
}

function validateMeshParams(value: unknown): ValidationResult<MeshParams> {
    if (!isRecord(value)) return fail('visual.mesh must be an object');
    const shape = readEnum(value, 'shape', meshShapes, 'visual.mesh.shape');
    if (!shape.ok) return shape;
    const scale = validateTuple3(value.scale, 'visual.mesh.scale');
    if (!scale.ok) return scale;
    const roughness = value.roughness === undefined ? undefined : readNumber(value, 'roughness', 'visual.mesh.roughness');
    if (roughness && !roughness.ok) return roughness;
    const metalness = value.metalness === undefined ? undefined : readNumber(value, 'metalness', 'visual.mesh.metalness');
    if (metalness && !metalness.ok) return metalness;
    return ok({ shape: shape.value, scale: scale.value, roughness: roughness?.value, metalness: metalness?.value });
}

function validateParticleParams(value: unknown): ValidationResult<ParticleParams> {
    if (!isRecord(value)) return fail('visual.particles must be an object');
    const count = readNumber(value, 'count', 'visual.particles.count');
    if (!count.ok) return count;
    const size = readNumber(value, 'size', 'visual.particles.size');
    if (!size.ok) return size;
    const lifetime = readNumber(value, 'lifetime', 'visual.particles.lifetime');
    if (!lifetime.ok) return lifetime;
    const emissionRate = readNumber(value, 'emissionRate', 'visual.particles.emissionRate');
    if (!emissionRate.ok) return emissionRate;
    return ok({ count: count.value, size: size.value, lifetime: lifetime.value, emissionRate: emissionRate.value });
}

function validateVisualSpec(value: unknown): ValidationResult<CosmeticVisualSpec> {
    if (!isRecord(value)) return fail('visual must be an object');
    const colors = readArray(value, 'colors', validateColor, 'visual.colors');
    if (!colors.ok) return colors;
    const mesh = value.mesh === undefined ? undefined : validateMeshParams(value.mesh);
    if (mesh && !mesh.ok) return mesh;
    const particles = value.particles === undefined ? undefined : validateParticleParams(value.particles);
    if (particles && !particles.ok) return particles;
    return ok({ colors: colors.value, mesh: mesh?.value, particles: particles?.value });
}

export function validateCosmeticDefinition(value: unknown): ValidationResult<CosmeticDefinition> {
    if (!isRecord(value)) return fail('cosmetic definition must be an object');
    if (typeof value.id !== 'string' || value.id.length === 0) return fail('id must be a non-empty string');
    const slot = readEnum(value, 'slot', cosmeticSlots);
    if (!slot.ok) return slot;
    const visual = validateVisualSpec(value.visual);
    if (!visual.ok) return visual;
    const rarity = readEnum(value, 'rarity', cosmeticRarities);
    if (!rarity.ok) return rarity;
    return ok({ id: value.id, slot: slot.value, visual: visual.value, rarity: rarity.value });
}
