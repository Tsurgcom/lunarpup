import * as THREE from 'three';

export function tintVoxelDog(dog: THREE.Group, color: number) {
    const snoutColor = new THREE.Color(color).lerp(new THREE.Color(0xdda15e), 0.45).getHex();
    dog.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const mat = object.material;
        if (!(mat instanceof THREE.MeshStandardMaterial)) return;
        if (object.userData.dogPart === 'snout') mat.color.setHex(snoutColor);
        else if (object.userData.dogPart === 'fur') mat.color.setHex(color);
    });
}

export function deckColorFromDog(dogColor: number): number {
    return new THREE.Color(dogColor).multiplyScalar(0.55).getHex();
}
