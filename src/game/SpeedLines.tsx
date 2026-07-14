import { useEffect, useRef } from "react";
import {
  createSpeedLines,
  getSpeedFx,
  updateSpeedLines,
} from "./speedLinesUtil";

/**
 * DOM radial speed lines + landing flash / air vignette.
 * Velocity / hang / punch driven; painted every frame via rAF.
 */
export function SpeedLines() {
  const ref = useRef<HTMLDivElement>(null);
  const flashRef = useRef<HTMLDivElement>(null);
  const linesRef = useRef<HTMLDivElement[]>([]);

  useEffect(() => {
    const layer = ref.current;
    const flash = flashRef.current;
    if (!layer) return;

    linesRef.current = createSpeedLines(layer);

    let raf = 0;
    const tick = () => {
      const fx = getSpeedFx();
      updateSpeedLines(linesRef.current, layer, fx);
      if (flash) {
        const punch = Math.min(1, fx.land);
        flash.style.opacity = punch > 0.04 ? (punch * 0.55).toFixed(3) : "0";
        flash.dataset.active = punch > 0.08 ? "1" : "0";
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      linesRef.current = [];
      layer.replaceChildren();
    };
  }, []);

  return (
    <>
      <div id="speed-lines" ref={ref} aria-hidden />
      <div id="landing-flash" ref={flashRef} aria-hidden />
    </>
  );
}
