import { useEffect, useRef } from "react";
import {
  createSpeedLines,
  getSpeedFx,
  subscribeSpeedFx,
  updateSpeedLines,
} from "./speedLinesUtil";

/** DOM radial speed lines — driven from Player via module store (no React spam). */
export function SpeedLines() {
  const ref = useRef<HTMLDivElement>(null);
  const linesRef = useRef<HTMLDivElement[]>([]);

  useEffect(() => {
    const layer = ref.current;
    if (!layer) return;

    linesRef.current = createSpeedLines(layer);

    const paint = () => {
      const fx = getSpeedFx();
      updateSpeedLines(linesRef.current, layer, fx.ratio, fx.boosting);
    };
    paint();
    const unsub = subscribeSpeedFx(paint);

    return () => {
      unsub();
      linesRef.current = [];
      layer.replaceChildren();
    };
  }, []);

  return <div id="speed-lines" ref={ref} aria-hidden />;
}
