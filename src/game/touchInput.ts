import type { ControlInput } from "./movement";

/** Module-level touch drive flags — OR'd with keyboard in Player each frame. */

const stick = {
  forward: false,
  back: false,
  left: false,
  right: false,
};

/** D-pad attitude: pitch (N/S) + yaw/turn (E/W). Merged with stick for left/right. */
const dpad = {
  pitchUp: false,
  pitchDown: false,
  left: false,
  right: false,
};

const buttons = {
  pitchUp: false,
  pitchDown: false,
  rollLeft: false,
  rollRight: false,
  boosting: false,
  jump: false,
};

export type TouchAxis = "forward" | "back" | "left" | "right";

export type TouchButton =
  | "jump"
  | "boosting"
  | "pitchUp"
  | "pitchDown"
  | "rollLeft"
  | "rollRight";

export function getTouchInput(): ControlInput {
  return {
    forward: stick.forward,
    back: stick.back,
    left: stick.left || dpad.left,
    right: stick.right || dpad.right,
    pitchUp: dpad.pitchUp || buttons.pitchUp,
    pitchDown: dpad.pitchDown || buttons.pitchDown,
    rollLeft: buttons.rollLeft,
    rollRight: buttons.rollRight,
    boosting: buttons.boosting,
    jump: buttons.jump,
  };
}

export function setTouchAxis(axis: TouchAxis, pressed: boolean): void {
  stick[axis] = pressed;
}

/** Set stick cardinals from a unit-ish vector (deadzone applied by caller). */
export function setTouchStick(dx: number, dy: number, threshold = 0.35): void {
  stick.forward = dy < -threshold;
  stick.back = dy > threshold;
  stick.left = dx < -threshold;
  stick.right = dx > threshold;
}

export function clearTouchStick(): void {
  stick.forward = false;
  stick.back = false;
  stick.left = false;
  stick.right = false;
}

/**
 * D-pad attitude from a unit-ish vector: N/S → pitch, E/W → yaw (turn).
 * Deadzone applied by caller.
 */
export function setTouchDpad(dx: number, dy: number, threshold = 0.35): void {
  dpad.pitchUp = dy < -threshold;
  dpad.pitchDown = dy > threshold;
  dpad.left = dx < -threshold;
  dpad.right = dx > threshold;
}

export function clearTouchDpad(): void {
  dpad.pitchUp = false;
  dpad.pitchDown = false;
  dpad.left = false;
  dpad.right = false;
}

export function setTouchButton(button: TouchButton, pressed: boolean): void {
  buttons[button] = pressed;
}

export function clearTouchInput(): void {
  clearTouchStick();
  clearTouchDpad();
  buttons.pitchUp = false;
  buttons.pitchDown = false;
  buttons.rollLeft = false;
  buttons.rollRight = false;
  buttons.boosting = false;
  buttons.jump = false;
}
