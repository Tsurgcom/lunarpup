import * as THREE from 'three';
import {
    scene,
    dog,
    setPlayerGroup,
    setTrickRoot,
    setSkateboard,
    setDog,
    setTail,
} from '../state.ts';
import { PLAYER_COLORS } from '../net/protocol.ts';

export interface VoxelDogParts {
    group: THREE.Group;
    skateboard: THREE.Group;
    dog: THREE.Group;
    tail: THREE.Mesh;
}

export function createVoxelDog(dogColor: number = PLAYER_COLORS[0] ?? 0xffb703, deckColor: number = 0xff5555): VoxelDogParts {
    const group = new THREE.Group();

    const skateboard = new THREE.Group();
    const deckGeom = new THREE.BoxGeometry(1.6, 0.15, 3.8);
    const deckMat = new THREE.MeshStandardMaterial({ color: deckColor, roughness: 0.5 });
    const deck = new THREE.Mesh(deckGeom, deckMat);
    deck.position.y = 0.3;
    deck.userData.dogPart = 'deck';
    deck.castShadow = true;
    skateboard.add(deck);

    const wheelGeom = new THREE.CylinderGeometry(0.25, 0.25, 0.3, 8);
    wheelGeom.rotateZ(Math.PI / 2);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.2 });
    const wheelPositions: Array<[number, number, number]> = [
        [-0.7, 0.2, 1.2], [0.7, 0.2, 1.2],
        [-0.7, 0.2, -1.2], [0.7, 0.2, -1.2],
    ];
    wheelPositions.forEach(pos => {
        const wheel = new THREE.Mesh(wheelGeom, wheelMat);
        wheel.position.set(pos[0], pos[1], pos[2]);
        wheel.castShadow = true;
        skateboard.add(wheel);
    });
    group.add(skateboard);

    const dog = new THREE.Group();
    const dogMat = new THREE.MeshStandardMaterial({ color: dogColor, flatShading: true });
    const snoutMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(dogColor).lerp(new THREE.Color(0xdda15e), 0.45).getHex(),
        flatShading: true,
    });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x222222 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(1, 0.9, 2), dogMat);
    body.position.set(0, 0.9, 0);
    body.castShadow = true;
    body.userData.dogPart = 'fur';
    dog.add(body);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), dogMat);
    head.position.set(0, 1.6, 0.7);
    head.castShadow = true;
    head.userData.dogPart = 'fur';

    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.4), snoutMat);
    snout.position.set(0, -0.15, 0.5);
    snout.userData.dogPart = 'snout';
    head.add(snout);

    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.1), darkMat);
    nose.position.set(0, 0.1, 0.22);
    snout.add(nose);

    const earL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.6, 0.3), dogMat);
    earL.position.set(0.50, 0.1, -0.1);
    earL.userData.dogPart = 'fur';
    const earR = earL.clone();
    earR.position.x = -0.50;
    head.add(earL, earR);

    const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.1), darkMat);
    eyeL.position.set(0.25, 0.15, 0.46);
    const eyeR = eyeL.clone();
    eyeR.position.x = -0.25;
    head.add(eyeL, eyeR);
    dog.add(head);

    const legGeom = new THREE.BoxGeometry(0.3, 0.5, 0.3);
    const legFL = new THREE.Mesh(legGeom, dogMat); legFL.position.set(0.35, 0.25, 0.7);
    const legFR = new THREE.Mesh(legGeom, dogMat); legFR.position.set(-0.35, 0.25, 0.7);
    const legBL = new THREE.Mesh(legGeom, dogMat); legBL.position.set(0.35, 0.25, -0.7);
    const legBR = new THREE.Mesh(legGeom, dogMat); legBR.position.set(-0.35, 0.25, -0.7);
    [legFL, legFR, legBL, legBR].forEach(l => { l.castShadow = true; l.userData.dogPart = 'fur'; dog.add(l); });

    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.7), dogMat);
    tail.position.set(0, 1.2, -1.1);
    tail.rotation.x = Math.PI / 4;
    tail.castShadow = true;
    tail.userData.dogPart = 'fur';
    dog.add(tail);

    dog.position.y = 0.15;
    group.add(dog);

    return { group, skateboard, dog, tail };
}

function setDogMaterialColor(root: THREE.Group, color: number) {
    const snoutColor = new THREE.Color(color).lerp(new THREE.Color(0xdda15e), 0.45).getHex();
    root.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return;
        const mat = obj.material;
        if (!(mat instanceof THREE.MeshStandardMaterial)) return;
        if (obj.userData.dogPart === 'snout') mat.color.setHex(snoutColor);
        else if (obj.userData.dogPart === 'fur') mat.color.setHex(color);
    });
}

export function tintLocalDog(color: number) {
    if (dog) setDogMaterialColor(dog, color);
}

export function createPlayer() {
    const playerGroup = new THREE.Group();
    const { group: trickRoot, skateboard, dog: dogGroup, tail: tailMesh } = createVoxelDog();
    playerGroup.add(trickRoot);
    scene.add(playerGroup);

    setPlayerGroup(playerGroup);
    setTrickRoot(trickRoot);
    setSkateboard(skateboard);
    setDog(dogGroup);
    setTail(tailMesh);
}
