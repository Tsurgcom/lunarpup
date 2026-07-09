import * as THREE from 'three';
import {
    scene,
    setPlayerGroup,
    setSkateboard,
    setDog,
    setTail,
} from '../state.ts';

export function createPlayer() {
    const playerGroup = new THREE.Group();

    const skateboard = new THREE.Group();
    const deckGeom = new THREE.BoxGeometry(1.6, 0.15, 3.8);
    const deckMat = new THREE.MeshStandardMaterial({ color: 0xff5555, roughness: 0.5 });
    const deck = new THREE.Mesh(deckGeom, deckMat);
    deck.position.y = 0.3;
    deck.castShadow = true;
    skateboard.add(deck);

    const wheelGeom = new THREE.CylinderGeometry(0.25, 0.25, 0.3, 8);
    wheelGeom.rotateZ(Math.PI / 2);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.2 });
    const wheelPositions = [
        [-0.7, 0.2, 1.2], [0.7, 0.2, 1.2],
        [-0.7, 0.2, -1.2], [0.7, 0.2, -1.2],
    ];
    wheelPositions.forEach(pos => {
        const wheel = new THREE.Mesh(wheelGeom, wheelMat);
        wheel.position.set(pos[0], pos[1], pos[2]);
        wheel.castShadow = true;
        skateboard.add(wheel);
    });
    playerGroup.add(skateboard);

    const dog = new THREE.Group();
    const dogMat = new THREE.MeshStandardMaterial({ color: 0xffb703, flatShading: true });
    const snoutMat = new THREE.MeshStandardMaterial({ color: 0xdda15e, flatShading: true });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x222222 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(1, 0.9, 2), dogMat);
    body.position.set(0, 0.9, 0);
    body.castShadow = true;
    dog.add(body);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), dogMat);
    head.position.set(0, 1.6, 0.7);
    head.castShadow = true;

    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.4), snoutMat);
    snout.position.set(0, -0.15, 0.5);
    head.add(snout);

    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.1), darkMat);
    nose.position.set(0, 0.1, 0.22);
    snout.add(nose);

    const earL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.6, 0.3), dogMat);
    earL.position.set(0.50, 0.1, -0.1);
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
    [legFL, legFR, legBL, legBR].forEach(l => { l.castShadow = true; dog.add(l); });

    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.7), dogMat);
    tail.position.set(0, 1.2, -1.1);
    tail.rotation.x = Math.PI / 4;
    tail.castShadow = true;
    dog.add(tail);

    dog.position.y = 0.15;
    playerGroup.add(dog);
    scene.add(playerGroup);

    setPlayerGroup(playerGroup);
    setSkateboard(skateboard);
    setDog(dog);
    setTail(tail);
}
