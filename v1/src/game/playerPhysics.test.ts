import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';
import {
    applyJumpVelocity,
    canCoyoteJump,
    canReengageHover,
    computeAirAcceleration,
    computeAirHoverAssist,
    computeHoverAcceleration,
    computeHoverDriveAcceleration,
    computeHoverNormalAcceleration,
    consumeJumpRequest,
    COYOTE_TIME_MS,
    getEffectiveSlideGrip,
    getGravityTangent,
    getGroundSpeed,
    getSlopeForward,
    integrateVelocity,
    isHoverEngaged,
    JUMP_BUFFER_MS,
    lostHoverContact,
    projectVelocityOntoTangentPlane,
    resolveHoverPenetration,
    stepHeading,
    wantsJump,
} from './playerPhysics.ts';

const hoverClearance = 0.42;

describe('playerPhysics jump helpers', () => {
    test('rejects a held space press without a fresh buffer', () => {
        expect(wantsJump({ queuedAt: 0 }, 1000)).toBe(false);
    });

    test('accepts a buffered jump inside the window', () => {
        const now = 1000;
        expect(wantsJump({ queuedAt: now - 100 }, now)).toBe(true);
    });

    test('rejects an expired buffered jump', () => {
        const now = 1000;
        expect(wantsJump({ queuedAt: now - JUMP_BUFFER_MS - 1 }, now)).toBe(false);
    });

    test('clears buffered jump requests after consumption', () => {
        const input = { queuedAt: 500 };
        consumeJumpRequest(input);
        expect(input.queuedAt).toBe(0);
    });

    test('allows coyote jumps shortly after leaving the ground', () => {
        expect(canCoyoteJump(false, COYOTE_TIME_MS / 2000)).toBe(true);
        expect(canCoyoteJump(false, (COYOTE_TIME_MS + 1) / 1000)).toBe(false);
        expect(canCoyoteJump(true, 0)).toBe(false);
    });
});

describe('playerPhysics hover helpers', () => {
    const basePhysics = {
        mass: 70,
        thrustForce: 2.1,
        hoverStiffness: 1.6,
        hoverDamping: 0.3,
        maxHoverForce: 4.5,
        maxHoverRange: 1.0,
        coastFriction: 0.002,
        coastDrag: 0.00075,
        airDrag: 0.015,
        gravity: 0.01,
        maxSpeed: 1.0,
        driftSlideMultiplier: 0.08,
        slideGrip: 0.014,
        driftGripMultiplier: 0.32,
        driftThreshold: 0.14,
        boostMultiplier: 1.85,
        boostAccelMultiplier: 2.2,
        airThrustMultiplier: 0.82,
        airSteerGrip: 0.022,
        airHoverAssist: 0.55,
    };

    const scratch = {
        baseForward: new THREE.Vector3(),
        slopeForward: new THREE.Vector3(),
        acceleration: new THREE.Vector3(),
        normalAcceleration: new THREE.Vector3(),
        tangentVelocity: new THREE.Vector3(),
    };

    test('projects velocity onto slope forward for ground speed', () => {
        const velocity = new THREE.Vector3(3, 0, 4);
        const slopeForward = new THREE.Vector3(0, 0, 1);
        expect(getGroundSpeed(velocity, slopeForward)).toBeCloseTo(4);
    });

    test('hover spring pushes upward when below target clearance', () => {
        const normal = new THREE.Vector3(0, 1, 0);
        const accel = computeHoverNormalAcceleration(
            basePhysics,
            0.2,
            hoverClearance,
            0,
            normal,
            new THREE.Vector3(),
        );
        expect(accel.y).toBeGreaterThan(0);
    });

    test('hover spring pulls downward when above target clearance', () => {
        const normal = new THREE.Vector3(0, 1, 0);
        const accel = computeHoverNormalAcceleration(
            basePhysics,
            0.8,
            hoverClearance,
            0,
            normal,
            new THREE.Vector3(),
        );
        expect(accel.y).toBeLessThan(0);
    });

    test('gravity tangent accelerates downhill along slope forward', () => {
        const normal = new THREE.Vector3(0, Math.cos(Math.PI / 6), Math.sin(Math.PI / 6)).normalize();
        getSlopeForward(0, normal, scratch);
        const gravityTangent = getGravityTangent(
            basePhysics.gravity * basePhysics.driftSlideMultiplier,
            normal,
            new THREE.Vector3(),
        );
        const downhillAccel = gravityTangent.dot(scratch.slopeForward);
        expect(downhillAccel).toBeGreaterThan(0);
    });

    test('thrust increases speed along slope forward when coasting does not', () => {
        const normal = new THREE.Vector3(0, 1, 0);
        getSlopeForward(0, normal, scratch);
        const velocity = new THREE.Vector3();

        computeHoverDriveAcceleration(
            basePhysics,
            velocity,
            { forward: true, reverse: false, boosting: false },
            normal,
            scratch.slopeForward,
            scratch,
        );
        integrateVelocity(velocity, scratch.acceleration, 1);
        const thrustSpeed = getGroundSpeed(velocity, scratch.slopeForward);

        velocity.set(0, 0, 0);
        computeHoverDriveAcceleration(
            basePhysics,
            velocity,
            { forward: false, reverse: false, boosting: false },
            normal,
            scratch.slopeForward,
            scratch,
        );
        integrateVelocity(velocity, scratch.acceleration, 1);
        const coastSpeed = getGroundSpeed(velocity, scratch.slopeForward);

        expect(thrustSpeed).toBeGreaterThan(coastSpeed);
        expect(coastSpeed).toBeCloseTo(0, 5);
    });

    test('coast friction bleeds speed toward zero without thrust', () => {
        const normal = new THREE.Vector3(0, 1, 0);
        getSlopeForward(0, normal, scratch);
        const velocity = new THREE.Vector3(0, 0, 0.8);
        const initialSpeed = getGroundSpeed(velocity, scratch.slopeForward);

        for (let i = 0; i < 240; i++) {
            computeHoverDriveAcceleration(
                basePhysics,
                velocity,
                { forward: false, reverse: false, boosting: false },
                normal,
                scratch.slopeForward,
                scratch,
            );
            integrateVelocity(velocity, scratch.acceleration, 1);
            projectVelocityOntoTangentPlane(velocity, normal, scratch.tangentVelocity);
        }

        const finalSpeed = Math.abs(getGroundSpeed(velocity, scratch.slopeForward));
        expect(finalSpeed).toBeLessThan(initialSpeed);
    });

    test('drift grip weakens when lateral speed exceeds threshold', () => {
        expect(getEffectiveSlideGrip(basePhysics, 0.05)).toBeCloseTo(basePhysics.slideGrip);
        expect(getEffectiveSlideGrip(basePhysics, 0.3)).toBeCloseTo(basePhysics.slideGrip * basePhysics.driftGripMultiplier);
    });

    test('jump preserves tangent velocity and adds speed along the terrain normal', () => {
        const normal = new THREE.Vector3(0, 1, 0);
        const velocity = new THREE.Vector3(4, 0, 4);
        const tangent = new THREE.Vector3();
        applyJumpVelocity(velocity, normal, 0.08, tangent);
        expect(velocity.x).toBeCloseTo(4);
        expect(velocity.z).toBeCloseTo(4);
        expect(velocity.y).toBeCloseTo(0.08);
    });

    test('air acceleration applies gravity, thrust, and steer', () => {
        const velocity = new THREE.Vector3(0, 0, 0.5);
        const airForward = new THREE.Vector3(0, 0, 1);
        const acceleration = computeAirAcceleration(
            basePhysics,
            velocity,
            { forward: true, reverse: false, boosting: false },
            airForward,
            scratch,
        );
        expect(acceleration.y).toBeLessThan(0);
        expect(acceleration.z).toBeGreaterThan(0);
    });

    test('air hover assist pushes up when falling inside hover range', () => {
        const normal = new THREE.Vector3(0, 1, 0);
        const assist = computeAirHoverAssist(
            basePhysics,
            0.3,
            hoverClearance,
            -0.1,
            normal,
            new THREE.Vector3(),
        );
        expect(assist.y).toBeGreaterThan(0);
    });

    test('downhill coast increases speed without thrust', () => {
        const slopeAngle = Math.PI / 5;
        const normal = new THREE.Vector3(0, Math.cos(slopeAngle), -Math.sin(slopeAngle)).normalize();
        getSlopeForward(0, normal, scratch);
        const velocity = new THREE.Vector3();

        for (let i = 0; i < 60; i++) {
            computeHoverDriveAcceleration(
                basePhysics,
                velocity,
                { forward: false, reverse: false, boosting: false },
                normal,
                scratch.slopeForward,
                scratch,
            );
            integrateVelocity(velocity, scratch.acceleration, 1);
            projectVelocityOntoTangentPlane(velocity, normal, scratch.tangentVelocity);
        }

        expect(Math.abs(getGroundSpeed(velocity, scratch.slopeForward))).toBeGreaterThan(0.0005);
    });

    test('combined hover acceleration includes spring and drive terms', () => {
        const normal = new THREE.Vector3(0, 1, 0);
        getSlopeForward(0, normal, scratch);
        const velocity = new THREE.Vector3(0, -0.02, 0.4);

        computeHoverAcceleration(
            basePhysics,
            velocity,
            { forward: true, reverse: false, boosting: false },
            normal,
            scratch.slopeForward,
            0.3,
            hoverClearance,
            scratch,
        );

        expect(scratch.acceleration.y).toBeGreaterThan(0);
        expect(scratch.acceleration.z).toBeGreaterThan(0);
    });

    test('resolves penetration without pulling when above the surface', () => {
        const position = new THREE.Vector3(0, 1, 0);
        const velocity = new THREE.Vector3(0, 0, 0);
        const normal = new THREE.Vector3(0, 1, 0);
        const beforeY = position.y;

        resolveHoverPenetration(0.8, hoverClearance, position, velocity, normal);
        expect(position.y).toBeCloseTo(beforeY);

        resolveHoverPenetration(0.2, hoverClearance, position, velocity, normal);
        expect(position.y).toBeCloseTo(1.22);
    });

    test('detects hover engagement within range', () => {
        expect(isHoverEngaged(0.42, 1.0)).toBe(true);
        expect(isHoverEngaged(1.2, 1.0)).toBe(false);
        expect(lostHoverContact(1.2, 1.0)).toBe(true);
    });

    test('reengages hover when descending into range', () => {
        expect(canReengageHover(0.9, 1.0, 0.05)).toBe(true);
        expect(canReengageHover(1.2, 1.0, 0.05)).toBe(false);
        expect(canReengageHover(0.9, 1.0, 0.3, 0.22)).toBe(false);
        expect(canReengageHover(0.9, 1.0, 0.18, 0.22)).toBe(true);
    });

    test('turns left and right independently', () => {
        expect(stepHeading(0, 0.1, true, false, 1)).toBeCloseTo(0.1);
        expect(stepHeading(0, 0.1, false, true, 1)).toBeCloseTo(-0.1);
        expect(stepHeading(1, 0.1, true, true, 1)).toBeCloseTo(1);
    });
});
