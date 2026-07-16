import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  clearTouchDpad,
  clearTouchInput,
  clearTouchStick,
  setTouchButton,
  setTouchDpad,
  setTouchStick,
  type TouchButton,
} from "./touchInput";
import {
  bindTouchUiInput,
  bindTouchUiMedia,
  getTouchUiMobileLayout,
  getTouchUiVisible,
  subscribeTouchUiVisible,
} from "./touchUiVisibility";

const STICK_THRESHOLD = 0.35;
const DEFAULT_STICK_RADIUS = 52;

function TouchPadButton({
  label,
  button,
  className,
  ariaLabel,
}: {
  label: string;
  button: TouchButton;
  className?: string;
  ariaLabel?: string;
}) {
  const pressedRef = useRef(false);

  const release = () => {
    if (!pressedRef.current) return;
    pressedRef.current = false;
    setTouchButton(button, false);
  };

  return (
    <button
      type="button"
      className={`touch-controls__btn${className ? ` ${className}` : ""}`}
      aria-label={ariaLabel ?? label}
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        pressedRef.current = true;
        setTouchButton(button, true);
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerUp={(e) => {
        e.preventDefault();
        e.stopPropagation();
        release();
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      }}
      onPointerCancel={(e) => {
        e.preventDefault();
        e.stopPropagation();
        release();
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span className="touch-controls__btn-label">{label}</span>
    </button>
  );
}

/** Latching boost: tap toggles on/off instead of hold-to-boost. */
function BoostToggleButton() {
  const [on, setOn] = useState(false);

  // Drop the flag if the touch UI unmounts while boosting.
  useEffect(() => () => setTouchButton("boosting", false), []);

  return (
    <button
      type="button"
      className={`touch-controls__btn touch-controls__btn--boost${on ? " is-on" : ""}`}
      aria-label="Boost"
      aria-pressed={on}
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const next = !on;
        setOn(next);
        setTouchButton("boosting", next);
      }}
      onPointerUp={(e) => {
        // No release logic — the toggle latches until the next tap.
        e.preventDefault();
        e.stopPropagation();
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span className="touch-controls__btn-label">BOOST</span>
    </button>
  );
}

function VirtualStick() {
  const knobRef = useRef<HTMLDivElement>(null);
  const activeId = useRef<number | null>(null);
  const origin = useRef({ x: 0, y: 0 });
  const radiusRef = useRef(DEFAULT_STICK_RADIUS);

  const setKnob = (dx: number, dy: number) => {
    const knob = knobRef.current;
    if (!knob) return;
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
  };

  const updateFromPointer = (clientX: number, clientY: number) => {
    const radius = radiusRef.current;
    let dx = clientX - origin.current.x;
    let dy = clientY - origin.current.y;
    const len = Math.hypot(dx, dy);
    if (len > radius) {
      dx = (dx / len) * radius;
      dy = (dy / len) * radius;
    }
    setKnob(dx, dy);
    setTouchStick(dx / radius, dy / radius, STICK_THRESHOLD);
  };

  const end = (el: HTMLButtonElement, pointerId: number) => {
    if (activeId.current !== pointerId) return;
    activeId.current = null;
    clearTouchStick();
    setKnob(0, 0);
    if (el.hasPointerCapture(pointerId)) {
      el.releasePointerCapture(pointerId);
    }
  };

  return (
    <button
      type="button"
      className="touch-controls__stick"
      aria-label="Move"
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (activeId.current !== null) return;
        activeId.current = e.pointerId;
        const rect = e.currentTarget.getBoundingClientRect();
        radiusRef.current = Math.min(rect.width, rect.height) * 0.42;
        origin.current = {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        };
        e.currentTarget.setPointerCapture(e.pointerId);
        updateFromPointer(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (activeId.current !== e.pointerId) return;
        e.preventDefault();
        e.stopPropagation();
        updateFromPointer(e.clientX, e.clientY);
      }}
      onPointerUp={(e) => {
        e.preventDefault();
        e.stopPropagation();
        end(e.currentTarget, e.pointerId);
      }}
      onPointerCancel={(e) => {
        e.preventDefault();
        e.stopPropagation();
        end(e.currentTarget, e.pointerId);
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div ref={knobRef} className="touch-controls__knob" />
      <span className="touch-controls__stick-label">MOVE</span>
    </button>
  );
}

/**
 * Cross-shaped attitude pad — same thumb drag as the stick, maps N/S → pitch
 * and E/W → yaw (turn). Used on tablet instead of stick-corner pitch buttons.
 */
function VirtualDpad() {
  const knobRef = useRef<HTMLDivElement>(null);
  const activeId = useRef<number | null>(null);
  const origin = useRef({ x: 0, y: 0 });
  const radiusRef = useRef(DEFAULT_STICK_RADIUS);

  const setKnob = (dx: number, dy: number) => {
    const knob = knobRef.current;
    if (!knob) return;
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
  };

  const updateFromPointer = (clientX: number, clientY: number) => {
    const radius = radiusRef.current;
    let dx = clientX - origin.current.x;
    let dy = clientY - origin.current.y;
    const len = Math.hypot(dx, dy);
    if (len > radius) {
      dx = (dx / len) * radius;
      dy = (dy / len) * radius;
    }
    setKnob(dx, dy);
    setTouchDpad(dx / radius, dy / radius, STICK_THRESHOLD);
  };

  const end = (el: HTMLButtonElement, pointerId: number) => {
    if (activeId.current !== pointerId) return;
    activeId.current = null;
    clearTouchDpad();
    setKnob(0, 0);
    if (el.hasPointerCapture(pointerId)) {
      el.releasePointerCapture(pointerId);
    }
  };

  return (
    <button
      type="button"
      className="touch-controls__dpad"
      aria-label="Pitch and yaw"
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (activeId.current !== null) return;
        activeId.current = e.pointerId;
        const rect = e.currentTarget.getBoundingClientRect();
        radiusRef.current = Math.min(rect.width, rect.height) * 0.42;
        origin.current = {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        };
        e.currentTarget.setPointerCapture(e.pointerId);
        updateFromPointer(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (activeId.current !== e.pointerId) return;
        e.preventDefault();
        e.stopPropagation();
        updateFromPointer(e.clientX, e.clientY);
      }}
      onPointerUp={(e) => {
        e.preventDefault();
        e.stopPropagation();
        end(e.currentTarget, e.pointerId);
      }}
      onPointerCancel={(e) => {
        e.preventDefault();
        e.stopPropagation();
        end(e.currentTarget, e.pointerId);
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span
        className="touch-controls__dpad-arm touch-controls__dpad-arm--n"
        aria-hidden
      >
        ▲
      </span>
      <span
        className="touch-controls__dpad-arm touch-controls__dpad-arm--s"
        aria-hidden
      >
        ▼
      </span>
      <span
        className="touch-controls__dpad-arm touch-controls__dpad-arm--w"
        aria-hidden
      >
        ◀
      </span>
      <span
        className="touch-controls__dpad-arm touch-controls__dpad-arm--e"
        aria-hidden
      >
        ▶
      </span>
      <div
        ref={knobRef}
        className="touch-controls__knob touch-controls__knob--dpad"
      />
    </button>
  );
}

function ActionButtons() {
  return (
    <div className="touch-controls__actions">
      <TouchPadButton
        label="JUMP"
        button="jump"
        className="touch-controls__btn--jump"
      />
      <BoostToggleButton />
    </div>
  );
}

function RollButtons() {
  return (
    <div className="touch-controls__roll">
      <TouchPadButton
        label="↺"
        ariaLabel="Roll left"
        button="rollLeft"
        className="touch-controls__btn--roll"
      />
      <TouchPadButton
        label="↻"
        ariaLabel="Roll right"
        button="rollRight"
        className="touch-controls__btn--roll"
      />
    </div>
  );
}

/** On-screen drive pad — glassy HUD chrome; visibility follows device + input. */
export function TouchControls() {
  const show = useSyncExternalStore(
    subscribeTouchUiVisible,
    getTouchUiVisible,
    () => false,
  );
  const mobile = useSyncExternalStore(
    subscribeTouchUiVisible,
    getTouchUiMobileLayout,
    () => false,
  );

  useEffect(() => {
    const unbindMedia = bindTouchUiMedia();
    const unbindInput = bindTouchUiInput();
    return () => {
      unbindMedia();
      unbindInput();
      clearTouchInput();
    };
  }, []);

  useEffect(() => {
    if (!show) clearTouchInput();
  }, [show]);

  if (!show) return null;

  // Tablet: two-handed bottom-corner grip — d-pad + actions left, move right.
  if (!mobile) {
    return (
      <div
        className="touch-controls touch-controls--tablet"
        aria-hidden={false}
      >
        <div className="touch-controls__dock touch-controls__dock--left">
          <div className="touch-controls__panel touch-controls__panel--attitude">
            <ActionButtons />
            <VirtualDpad />
          </div>
        </div>
        <div className="touch-controls__dock touch-controls__dock--right">
          <RollButtons />
          <div className="touch-controls__panel touch-controls__panel--drive">
            <div className="touch-controls__stick-wrap">
              <VirtualStick />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="touch-controls touch-controls--mobile" aria-hidden={false}>
      <div className="touch-controls__dock">
        <RollButtons />
        <div className="touch-controls__panel">
          <div className="touch-controls__stick-row">
            <div className="touch-controls__stick-wrap">
              <VirtualStick />
              <TouchPadButton
                label="+"
                button="pitchUp"
                className="touch-controls__btn--pitch touch-controls__btn--pitch-up"
              />
              <TouchPadButton
                label="−"
                button="pitchDown"
                className="touch-controls__btn--pitch touch-controls__btn--pitch-down"
              />
            </div>
          </div>
          <ActionButtons />
        </div>
      </div>
    </div>
  );
}
