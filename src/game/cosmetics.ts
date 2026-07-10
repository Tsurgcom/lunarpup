import * as THREE from 'three';
import type { CosmeticPackage, EquippedCosmetics } from '../cosmetics/registry.ts';
import { getActiveRuntime, registerUpdateHook } from './runtimeRegistry.ts';
import type { VoxelDogParts } from './types.ts';

interface AppliedCosmeticHandle {
    dispose(): void;
}

const localHandles: AppliedCosmeticHandle[] = [];
let knownCatalog: CosmeticPackage[] = [];
let catalogRevision = 0;
const catalogListeners = new Set<(revision: number) => void>();

export function setKnownCosmeticCatalog(catalog: CosmeticPackage[]): void {
    knownCatalog = catalog;
    catalogRevision += 1;
    for (const listener of catalogListeners) listener(catalogRevision);
}

export function getCosmeticCatalogRevision(): number {
    return catalogRevision;
}

export function subscribeCosmeticCatalog(listener: (revision: number) => void): () => void {
    catalogListeners.add(listener);
    return () => catalogListeners.delete(listener);
}

const remoteHandles = new WeakMap<THREE.Group, AppliedCosmeticHandle[]>();

export function applyLocalCosmetics(equipped: EquippedCosmetics, catalog: CosmeticPackage[]): void {
    const runtime = getActiveRuntime();
    const parts = runtime?.parts;
    if (!parts) return;
    setKnownCosmeticCatalog(catalog);
    disposeHandles(localHandles);
    localHandles.push(...buildCosmeticHandles(parts, equipped, catalog, true));
}

export function applyRemoteCosmetics(parts: VoxelDogParts, equipped: EquippedCosmetics | undefined, catalog = knownCatalog): void {
    const previous = remoteHandles.get(parts.group) ?? [];
    disposeHandles(previous);
    const next = buildCosmeticHandles(parts, equipped ?? {}, catalog, false);
    remoteHandles.set(parts.group, next);
}

function buildCosmeticHandles(parts: Pick<VoxelDogParts, 'group' | 'dog' | 'skateboard'>, equipped: EquippedCosmetics, catalog: CosmeticPackage[], animate: boolean): AppliedCosmeticHandle[] {
    const byId = new Map(catalog.map(pkg => [pkg.id, pkg]));
    const handles: AppliedCosmeticHandle[] = [];
    const board = equipped.board ? byId.get(equipped.board) : undefined;
    const body = equipped.body ? byId.get(equipped.body) : undefined;
    const trail = equipped.trail ? byId.get(equipped.trail) : undefined;
    const aura = equipped.aura ? byId.get(equipped.aura) : undefined;

    if (board) handles.push(recolorMeshes(parts.skateboard, Number.parseInt(board.definition.visual.colors[0]!.slice(1, 7), 16), 'deck'));
    if (body) handles.push(recolorMeshes(parts.dog, Number.parseInt(body.definition.visual.colors[0]!.slice(1, 7), 16), 'fur'));
    if (trail) handles.push(addTrail(parts.group, trail, animate));
    if (aura) handles.push(addAura(parts.group, aura, animate));
    return handles;
}

function recolorMeshes(root: THREE.Group, color: number, dogPart?: string): AppliedCosmeticHandle {
    const originals: Array<{ material: THREE.MeshStandardMaterial; color: THREE.Color }> = [];
    root.traverse(obj => {
        if (!(obj instanceof THREE.Mesh)) return;
        if (dogPart && obj.userData.dogPart !== dogPart) return;
        const material = obj.material;
        if (!(material instanceof THREE.MeshStandardMaterial)) return;
        originals.push({ material, color: material.color.clone() });
        material.color.setHex(color);
    });
    return { dispose: () => originals.forEach(original => original.material.color.copy(original.color)) };
}

function addTrail(group: THREE.Group, cosmetic: CosmeticPackage, animate: boolean): AppliedCosmeticHandle {
    const particleSpec = cosmetic.definition.visual.particles ?? { count: 24, size: 0.08, lifetime: 0.6, emissionRate: 16 };
    const color = new THREE.Color(cosmetic.definition.visual.colors[0]);
    const dots: THREE.Mesh[] = [];
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, depthWrite: false });
    const geometry = new THREE.SphereGeometry(particleSpec.size, 8, 6);
    const root = new THREE.Group();
    root.position.set(0, 0.35, -2.25);
    for (let index = 0; index < Math.min(particleSpec.count, 48); index += 1) {
        const dot = new THREE.Mesh(geometry, material.clone());
        dot.position.set((Math.random() - 0.5) * 0.8, Math.random() * 0.25, -index * 0.12);
        dot.userData.age = index / Math.max(1, particleSpec.count);
        dots.push(dot);
        root.add(dot);
    }
    group.add(root);

    const unregister = animate ? registerUpdateHook((dt) => {
        for (const dot of dots) {
            dot.userData.age = (dot.userData.age + dt * particleSpec.emissionRate * 0.08) % 1;
            dot.position.z = -0.3 - dot.userData.age * particleSpec.lifetime * 4;
            const dotMaterial = dot.material;
            if (dotMaterial instanceof THREE.MeshBasicMaterial) dotMaterial.opacity = 0.65 * (1 - dot.userData.age);
        }
    }) : undefined;

    return {
        dispose() {
            unregister?.();
            group.remove(root);
            geometry.dispose();
            material.dispose();
            for (const dot of dots) if (dot.material instanceof THREE.Material) dot.material.dispose();
        },
    };
}

function addAura(group: THREE.Group, cosmetic: CosmeticPackage, animate: boolean): AppliedCosmeticHandle {
    const mesh = cosmetic.definition.visual.mesh;
    const color = new THREE.Color(cosmetic.definition.visual.colors[0]);
    const geometry = new THREE.TorusGeometry(mesh?.scale[0] ?? 1.3, mesh?.scale[1] ?? 0.08, 8, 32);
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.4, depthWrite: false });
    const aura = new THREE.Mesh(geometry, material);
    aura.rotation.x = Math.PI / 2;
    aura.position.y = 1.05;
    group.add(aura);

    const unregister = animate ? registerUpdateHook((dt) => {
        aura.rotation.z += dt * 1.6;
        material.opacity = 0.32 + Math.sin(Date.now() * 0.004) * 0.1;
    }) : undefined;

    return {
        dispose() {
            unregister?.();
            group.remove(aura);
            geometry.dispose();
            material.dispose();
        },
    };
}

function disposeHandles(handles: AppliedCosmeticHandle[]): void {
    for (const handle of handles.splice(0)) handle.dispose();
}
