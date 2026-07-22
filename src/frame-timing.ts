// Defensive upper bound on a single frame's elapsed time. Realistic stalls
// during effects/GC are well under 300 ms; anything larger is treated as a
// pathological pause and is clamped so gravity cannot teleport a piece,
// even if a future mode raises the maximum gravity tier.
export const MAX_DELTA_MS = 750;

export function frameDelta(now: number, previousFrame: number): number {
  return Math.min(MAX_DELTA_MS, Math.max(0, now - previousFrame));
}
