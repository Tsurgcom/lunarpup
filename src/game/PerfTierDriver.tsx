import { useFrame } from "@react-three/fiber";
import { useEffect } from "react";
import { resetPerformanceTier, tickPerformanceTier } from "./performanceTiers";

type PerfTierDriverProps = {
  /** When false, freeze the tier (menu / pause) but keep the last choice. */
  active?: boolean;
};

/**
 * Samples frame dt and drives adaptive quality. Mount once inside the Canvas.
 * Resets to the lowest tier on mount so each session boots cheap.
 */
export function PerfTierDriver({ active = true }: PerfTierDriverProps) {
  useEffect(() => {
    resetPerformanceTier();
    return () => resetPerformanceTier();
  }, []);

  useFrame((_, delta) => {
    if (!active) return;
    tickPerformanceTier(delta * 1000);
  }, -50);

  return null;
}
