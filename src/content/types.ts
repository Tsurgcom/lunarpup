import type { Vector3Tuple } from 'three';

export type AnimationMap = Record<string, string>;

export interface AnimalDefinition {
    id: string;
    displayName: string;
    modelUrl?: string;
    animations?: AnimationMap;
    scale: number;
    attachmentPoints: Record<string, Vector3Tuple>;
}

export interface SkateboardDefinition {
    id: string;
    displayName: string;
    modelUrl?: string;
    wheelRadius: number;
    deckOffset: Vector3Tuple;
}

export interface MaterialDefinition {
    id: string;
    displayName: string;
    textureUrl?: string;
    color: number;
    roughness: number;
    metalness: number;
}

export interface PlayerLoadout {
    animalId: string;
    skateboardId: string;
    materialId: string;
}
