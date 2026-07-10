import { describe, expect, test } from 'bun:test';
import { physicsTuningDefaults, tuningSettings } from '../config.ts';
import { createGameRuntime } from '../game/runtime.ts';

describe('physics tuning defaults', () => {
    test('are immutable application defaults shared by every runtime', () => {
        expect(Object.isFrozen(physicsTuningDefaults)).toBe(true);
        const first = createGameRuntime();
        first.physics.maxSpeed = 2.4;
        const second = createGameRuntime();

        for (const setting of tuningSettings) {
            expect(second.physics[setting.key]).toBe(physicsTuningDefaults[setting.key]);
        }
        expect(physicsTuningDefaults.maxSpeed).toBe(0.8);
    });
});
