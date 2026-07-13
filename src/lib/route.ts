import type { TransitMode } from "@/data/types";

export function resolveEffectiveMode(
  hopDistanceMeters: number,
  tripTransitMode: TransitMode,
  walkThresholdMeters: number | null | undefined
): TransitMode {
  if (walkThresholdMeters !== null && walkThresholdMeters !== undefined && hopDistanceMeters < walkThresholdMeters) {
    return "walk";
  }

  return tripTransitMode;
}
