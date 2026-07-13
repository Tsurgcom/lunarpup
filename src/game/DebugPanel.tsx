import { useEffect, useRef } from "react";
import {
  type DebugFrame,
  getDebugFrame,
  isDebugEnabled,
  subscribeDebugFrame,
} from "./debugFrame";

function fmt(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(digits);
}

function row(label: string, value: string, warn = false): string {
  const cls = warn ? ' class="hud-debug__warn"' : "";
  return `<div class="hud-debug__row"${cls}><span>${label}</span><b>${value}</b></div>`;
}

function paint(el: HTMLElement, f: DebugFrame): void {
  const bodyChat = f.peakBodyDelta > 0.04;
  const quatChat = f.quatErr > 0.02;

  el.innerHTML = [
    `<div class="hud-debug__title">frame debug <small>?debug</small></div>`,
    row("fps", `${fmt(f.fpsSmooth, 0)}  (${fmt(f.dtMs, 1)} ms)`),
    row("speed", `${fmt(f.speed, 2)} m/s`),
    row("lean / pitch", `${fmt(f.lean, 2)} / ${fmt(f.pitch, 2)}`),
    `<div class="hud-debug__sep"></div>`,
    row("body Δ", `${fmt(f.bodyDelta * 1000, 2)} mm`, bodyChat),
    row("quat err", `${fmt(f.quatErr * (180 / Math.PI), 2)}°`, quatChat),
    row("peak body Δ", `${fmt(f.peakBodyDelta * 1000, 2)} mm /0.5s`, bodyChat),
    row("peak dt", `${fmt(f.peakDtMs, 1)} ms /0.5s`, f.peakDtMs > 20),
  ].join("");
}

/** Live per-frame jitter readout. Mount only when `?debug` is set. */
export function DebugPanel() {
  const root = useRef<HTMLDivElement>(null);
  const enabled = isDebugEnabled();

  useEffect(() => {
    if (!enabled) return;
    const el = root.current;
    if (!el) return;

    let raf = 0;
    let dirty = true;
    const mark = () => {
      dirty = true;
    };
    const unsub = subscribeDebugFrame(mark);

    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (!dirty) return;
      dirty = false;
      paint(el, getDebugFrame());
    };
    raf = requestAnimationFrame(loop);
    paint(el, getDebugFrame());

    return () => {
      unsub();
      cancelAnimationFrame(raf);
    };
  }, [enabled]);

  if (!enabled) return null;
  return <div ref={root} className="hud-debug" />;
}
