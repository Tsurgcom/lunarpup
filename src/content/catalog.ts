import type {
    AnimalDefinition,
    MaterialDefinition,
    PlayerLoadout,
    SkateboardDefinition,
} from './types.ts';

export const animals: Record<string, AnimalDefinition> = {
    dog: {
        id: 'dog',
        displayName: 'Lunar Pup',
        scale: 1,
        animations: {},
        attachmentPoints: { board: [0, -0.42, 0], tail: [0, 0.55, 0.32] },
    },
};

export const skateboards: Record<string, SkateboardDefinition> = {
    classic: {
        id: 'classic',
        displayName: 'Classic Board',
        wheelRadius: 0.12,
        deckOffset: [0, 0, 0],
    },
};

export const materials: Record<string, MaterialDefinition> = {
    lunar: {
        id: 'lunar',
        displayName: 'Lunar Blue',
        color: 0x8b91a8,
        roughness: 0.9,
        metalness: 0.05,
    },
};

export const defaultLoadout: PlayerLoadout = {
    animalId: 'dog',
    skateboardId: 'classic',
    materialId: 'lunar',
};

export function resolveLoadout(loadout: Partial<PlayerLoadout> = {}): {
    animal: AnimalDefinition;
    skateboard: SkateboardDefinition;
    material: MaterialDefinition;
} {
    const animal = animals[loadout.animalId ?? defaultLoadout.animalId] ?? animals[defaultLoadout.animalId]!;
    const skateboard = skateboards[loadout.skateboardId ?? defaultLoadout.skateboardId] ?? skateboards[defaultLoadout.skateboardId]!;
    const material = materials[loadout.materialId ?? defaultLoadout.materialId] ?? materials[defaultLoadout.materialId]!;
    return { animal, skateboard, material };
}
