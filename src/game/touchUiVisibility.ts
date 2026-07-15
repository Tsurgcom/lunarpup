import { clearTouchInput } from "./touchInput";

/**
 * Touch pad visibility:
 * - small screens → show by default
 * - large screens → show by default only if a touchscreen is detected
 * - any touch → show
 * - any keyboard → hide
 */

type Pref = "auto" | "show" | "hide";

const SMALL_SCREEN = "(max-width: 768px)";

/** Fraction of view height to lift framing when the mobile glass pad is up. */
const MOBILE_CAMERA_LIFT = 0.16;

let pref: Pref = "auto";
const listeners = new Set<() => void>();

function hasTouchscreen(): boolean {
  return typeof navigator !== "undefined" && navigator.maxTouchPoints > 0;
}

export function isSmallScreen(): boolean {
  return (
    typeof window !== "undefined" && window.matchMedia(SMALL_SCREEN).matches
  );
}

function defaultVisible(): boolean {
  return isSmallScreen() || hasTouchscreen();
}

export function getTouchUiVisible(): boolean {
  if (pref === "show") return true;
  if (pref === "hide") return false;
  return defaultVisible();
}

/** Compact full-width glass pad layout (phones / narrow viewports). */
export function getTouchUiMobileLayout(): boolean {
  return getTouchUiVisible() && isSmallScreen();
}

/**
 * Vertical view lift (0–1 of viewport height) so the pup sits above the
 * bottom glass control panel on mobile.
 */
export function getTouchCameraLift(): number {
  return getTouchUiMobileLayout() ? MOBILE_CAMERA_LIFT : 0;
}

function notify(): void {
  for (const listener of listeners) listener();
}

export function subscribeTouchUiVisible(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Reveal pads after a touch anywhere. */
export function revealTouchUi(): void {
  if (pref === "show") return;
  pref = "show";
  notify();
}

/** Hide pads when the keyboard is used. */
export function hideTouchUi(): void {
  if (pref === "hide") return;
  pref = "hide";
  clearTouchInput();
  notify();
}

/** Recompute when viewport size changes. */
export function bindTouchUiMedia(): () => void {
  if (typeof window === "undefined") return () => {};

  const mq = window.matchMedia(SMALL_SCREEN);
  const onChange = () => {
    notify();
  };
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/** Global show-on-touch / hide-on-keyboard while playing. */
export function bindTouchUiInput(): () => void {
  if (typeof window === "undefined") return () => {};

  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === "touch") revealTouchUi();
  };

  const onKeyDown = () => {
    hideTouchUi();
  };

  window.addEventListener("pointerdown", onPointerDown, { passive: true });
  window.addEventListener("keydown", onKeyDown);
  return () => {
    window.removeEventListener("pointerdown", onPointerDown);
    window.removeEventListener("keydown", onKeyDown);
  };
}
