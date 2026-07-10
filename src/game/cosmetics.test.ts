import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';
import { loadCosmeticCatalog } from '../cosmetics/registry.ts';
import {
    applyRemoteCosmetics,
    setKnownCosmeticCatalog,
    subscribeCosmeticCatalog,
} from './cosmetics.ts';
import type { VoxelDogParts } from './types.ts';

describe('remote cosmetic catalog readiness', () => {
    test('reapplies an already-mounted peer when the catalog arrives later', async () => {
        const catalog = await loadCosmeticCatalog();
        const board = catalog.find((item) => item.definition.slot === 'board');
        if (!board) throw new Error('board fixture missing');

        const group = new THREE.Group();
        const dog = new THREE.Group();
        const skateboard = new THREE.Group();
        const material = new THREE.MeshStandardMaterial({ color: 0xff0000 });
        const deck = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
        deck.userData.dogPart = 'deck';
        skateboard.add(deck);
        group.add(dog, skateboard);
        const parts: VoxelDogParts = {
            group,
            skateboard,
            dog,
            tail: new THREE.Mesh(),
        };
        const equipped = { board: board.id };

        setKnownCosmeticCatalog([]);
        applyRemoteCosmetics(parts, equipped);
        expect(material.color.getHex()).toBe(0xff0000);

        const unsubscribe = subscribeCosmeticCatalog(() => applyRemoteCosmetics(parts, equipped));
        setKnownCosmeticCatalog(catalog);
        const expected = Number.parseInt(board.definition.visual.colors[0]!.slice(1, 7), 16);
        expect(material.color.getHex()).toBe(expected);

        unsubscribe();
        applyRemoteCosmetics(parts, undefined, []);
        deck.geometry.dispose();
        material.dispose();
    });
});
