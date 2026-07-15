import type { ControlInput } from "./movement";

/** Module-level touch drive flags — OR'd with keyboard in Player each frame. */

const touch: ControlInput = {
  forward: false,
  back: false,
  left: false,
  right: false,
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
  return touch;
}

export function setTouchAxis(axis: TouchAxis, pressed: boolean): void {
  touch[axis] = pressed;
}

/** Set stick cardinals from a unit-ish vector (deadzone applied by caller). */
export function setTouchStick(dx: number, dy: number, threshold = 0.35): void {
  touch.forward = dy < -threshold;
  touch.back = dy > threshold;
  touch.left = dx < -threshold;
  touch.right = dx > threshold;
}

export function clearTouchStick(): void {
  touch.forward = false;
  touch.back = false;
  touch.left = false;
  touch.right = false;
}

export function setTouchButton(button: TouchButton, pressed: boolean): void {
  touch[button] = pressed;
}

export function clearTouchInput(): void {
  touch.forward = false;
  touch.back = false;
  touch.left = false;
  touch.right = false;
  touch.pitchUp = false;
  touch.pitchDown = false;
  touch.rollLeft = false;
  touch.rollRight = false;
  touch.boosting = false;
  touch.jump = false;
}
