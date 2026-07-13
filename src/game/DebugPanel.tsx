import { useEffect, useRef } from "react";
import {
  getDebugFrame,
  isDebugEnabled,
  subscribeDebugFrame,
  type DebugFrame,
} from "./debugFrame";

function fmt(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(digits);
}

function flag(on: boolean): string {
  return on ? "YES" : "no";
}

function row(label: string, value: string, warn = false): string {
  const cls = warn ? ' class="hud-debug__warn"' : "";
  return `<div class="hud-debug__row"${cls}><span>${label}</span><b>${value}</b></div>`;
}

function paint(el: HTMLElement, f: DebugFrame): void {
  const bodyChat =
    f.peakBodyRadial > 0.012 || f.peakBodyDelta > 0.04;
  const renderChat = f.peakRenderDelta > 0.04;
  const gapChat = Math.abs(f.bodyRenderRadial) > 0.02;
  const flipChat = f.groundedFlips > 0;
  const quatChat = f.quatErr > 0.02;

  el.innerHTML = [
    `<div class="hud-debug__title">frame debug <small>?debug</small></div>`,
    row("fps", `${fmt(f.fpsSmooth, 0)}  (${fmt(f.dtMs, 1)} ms)`),
    row("speed", `${fmt(f.speed, 2)} m/s`),
    row("grounded", flag(f.grounded), flipChat),
    row("airTime", `${fmt(f.airTime, 2)} s`),
    row("vn", `${fmt(f.vn, 3)} m/s`),
    row("penetrate", `${fmt(f.penetration * 1000, 1)} mm`),
    row("N force", fmt(f.normalForce, 0)),
    row("lean / pitch", `${fmt(f.lean, 2)} / ${fmt(f.pitch, 2)}`),
    `<div class="hud-debug__sep"></div>`,
    row("body Δ", `${fmt(f.bodyDelta * 1000, 2)} mm`, bodyChat),
    row("  radial", `${fmt(f.bodyRadial * 1000, 2)} mm`, bodyChat),
    row("  tangent", `${fmt(f.bodyTangential * 1000, 2)} mm`),
    row("render Δ", `${fmt(f.renderDelta * 1000, 2)} mm`, renderChat),
    row("body−render", `${fmt(f.bodyRenderGap * 1000, 2)} mm`, gapChat),
    row("  radial gap", `${fmt(f.bodyRenderRadial * 1000, 2)} mm`, gapChat),
    row("quat err", `${fmt(f.quatErr * (180 / Math.PI), 2)}°`, quatChat),
    row("radial damp", flag(f.dampActive)),
    `<div class="hud-debug__sep"></div>`,
    row("peak body Δ", `${fmt(f.peakBodyDelta * 1000, 2)} mm /0.5s`, bodyChat),
    row(
      "peak radial",
      `${fmt(f.peakBodyRadial * 1000, 2)} mm /0.5s`,
      bodyChat,
    ),
    row(
      "peak render",
      `${fmt(f.peakRenderDelta * 1000, 2)} mm /0.5s`,
      renderChat,
    ),
    row("ground flips", `${f.groundedFlips} /0.5s`, flipChat),
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
