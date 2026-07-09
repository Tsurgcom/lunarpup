import type { GamemodePackageDefinition } from '../../src/modes/runtime.ts';

export const raceGamemodePackage: GamemodePackageDefinition = {
    manifest: {
        id: '412d11d15f0cbffba5c8f8b4455e20c190783a2d6022ffa915477481bfbc1a95',
        kind: 'gamemode',
        version: '1.0.0',
        author: 'Lunar Pup',
        displayName: 'Crater Circuit',
        assetRefs: [],
        metadata: { mode: 'race' },
    },
    params: {
        type: 'race',
        laps: 2,
        startPosition: { x: 0, y: 8, z: 0 },
        checkpoints: [
            { id: 'start-finish', order: 0, position: { x: 0, y: 8, z: 0 }, radius: 18 },
            { id: 'ridge-turn', order: 1, position: { x: 120, y: 14, z: 80 }, radius: 22 },
            { id: 'crater-gate', order: 2, position: { x: 210, y: 12, z: -50 }, radius: 22 },
            { id: 'home-stretch', order: 3, position: { x: 70, y: 9, z: -135 }, radius: 22 },
        ],
    },
};

export const parkourGamemodePackage: GamemodePackageDefinition = {
    manifest: {
        id: 'dd2c367cb292d5921d905ce67156acb5a59cd9a8d16c9917b0592f38a003057d',
        kind: 'gamemode',
        version: '1.0.0',
        author: 'Lunar Pup',
        displayName: 'Low Orbit Parkour',
        assetRefs: [],
        metadata: { mode: 'parkour' },
    },
    params: {
        type: 'parkour',
        startPosition: { x: -80, y: 36, z: -40 },
        fallY: 4,
        checkpoints: [
            { id: 'launch-pad', order: 0, position: { x: -80, y: 38, z: -40 }, radius: 12 },
            { id: 'satellite-hop', order: 1, position: { x: -42, y: 50, z: -18 }, radius: 10 },
            { id: 'comet-bridge', order: 2, position: { x: 5, y: 62, z: 8 }, radius: 10 },
            { id: 'moonshot', order: 3, position: { x: 52, y: 76, z: 34 }, radius: 12 },
        ],
        platforms: [
            { id: 'launch-pad', position: { x: -80, y: 32, z: -40 }, size: { x: 34, y: 4, z: 28 } },
            { id: 'satellite-hop', position: { x: -42, y: 44, z: -18 }, size: { x: 26, y: 4, z: 22 } },
            { id: 'comet-bridge', position: { x: 5, y: 56, z: 8 }, size: { x: 30, y: 4, z: 20 } },
            { id: 'moonshot', position: { x: 52, y: 70, z: 34 }, size: { x: 36, y: 4, z: 28 } },
        ],
    },
};

export const gamemodePackages = [raceGamemodePackage, parkourGamemodePackage] as const;
