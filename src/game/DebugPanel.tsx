import { useEffect, useRef } from "react";
import { getDebugChunkQueue, getDebugChunkWorkers } from "./ChunkTerrain";
import { CLIPMAP_LODS, getChunkLodSnapshot } from "./chunkLod";
import { type DebugFrame, getDebugFrame, isDebugEnabled } from "./debugFrame";
import {
  getPerfFpsSmooth,
  getPerfMaxTier,
  getPerfOverrideLabel,
  getPerfSettings,
  isPerfAuto,
} from "./performanceTiers";

function fmt(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(digits);
}

function row(label: string, value: string, warn = false): string {
  const cls = warn ? ' class="hud-debug__warn"' : "";
  return `<div class="hud-debug__row"${cls}><span>${label}</span><b>${value}</b></div>`;
}

function lodSwatches(): string {
  const chips = CLIPMAP_LODS.map(
    (r, i) =>
      `<span style="display:inline-block;width:8px;height:8px;border-radius:1px;background:${r.color};margin-right:2px" title="L${i}"></span>`,
  ).join("");
  return `<div class="hud-debug__row"><span>lod</span><b>${chips}</b></div>`;
}

function paint(el: HTMLElement, f: DebugFrame): void {
  const bodyChat = f.peakBodyDelta > 0.04;
  const quatChat = f.quatErr > 0.02;
  const lod = getChunkLodSnapshot();
  const perf = getPerfSettings();

  const tierWarn = perf.tier === 0;
  el.innerHTML = [
    `<div class="hud-debug__title">frame debug <small>?debug</small></div>`,
    row("fps", `${fmt(f.fpsSmooth, 0)}  (${fmt(f.dtMs, 1)} ms)`),
    row(
      "tier",
      `${getPerfOverrideLabel()}${isPerfAuto() ? `  ${perf.tier}/${getPerfMaxTier()}` : ""}  ·  ${fmt(getPerfFpsSmooth(), 0)} fps`,
      tierWarn,
    ),
    row(
      "quality",
      `dpr≤${fmt(perf.dpr, 2)}  shadows ${perf.shadows ? perf.shadowMapSize : "off"}  tess×${fmt(perf.lodSubdivScale, 2)}`,
    ),
    row("speed", `${fmt(f.speed, 2)} m/s`),
    row("lean / pitch", `${fmt(f.lean, 2)} / ${fmt(f.pitch, 2)}`),
    `<div class="hud-debug__sep"></div>`,
    row("body Δ", `${fmt(f.bodyDelta * 1000, 2)} mm`, bodyChat),
    row("quat err", `${fmt(f.quatErr * (180 / Math.PI), 2)}°`, quatChat),
    row("peak body Δ", `${fmt(f.peakBodyDelta * 1000, 2)} mm /0.5s`, bodyChat),
    row("peak dt", `${fmt(f.peakDtMs, 1)} ms /0.5s`, f.peakDtMs > 20),
    `<div class="hud-debug__sep"></div>`,
    row("chunks", `${lod.chunks.length}`),
    row("workers", `${getDebugChunkWorkers()}  q ${getDebugChunkQueue()}`),
    row("lod scale", `×${fmt(lod.speedScale, 2)}`),
    row("look-ahead", `${fmt(lod.lookAheadArc, 1)} m`),
    lodSwatches(),
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
    const loop = () => {
      raf = requestAnimationFrame(loop);
      paint(el, getDebugFrame());
    };
    raf = requestAnimationFrame(loop);
    paint(el, getDebugFrame());

    return () => cancelAnimationFrame(raf);
  }, [enabled]);

  if (!enabled) return null;
  return <div ref={root} className="hud-debug" />;
}
