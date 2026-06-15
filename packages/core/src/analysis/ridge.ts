import type { Derived, Fix, RidgeSoar } from "../types";
import { angleDiff } from "./geo";
import { PARAMS as CIRCLING_PARAMS } from "./phases";

export const RIDGE_PARAMS = {
  /** Sliding window (s) over which mean vario is evaluated. */
  windowSec: 30,
  /** Mean vario must be ≥ this (m/s): "not constantly sinking". */
  minMeanVarioMs: -0.2,
  /** Net altitude loss over a run must not exceed this (m). */
  maxNetLossM: 30,
  /** Must be moving (m/s). */
  minGroundSpeedMs: 3,
  /** A ridge run must last at least this long (s). */
  minDurationSec: 60,
  /** Bridge ridge runs separated by less than this (s). Configurable. */
  bridgeGapSec: 20,
};

/**
 * Detect ridge / slope soaring segments within the active range.
 *
 * Ridge soaring is sustained non-circling flight that maintains altitude —
 * generally holding height with no 360s and no figure-8s. No reversal or
 * spatial-confinement pattern is required: a straight ridge run qualifies
 * equally with a back-and-forth one, as long as:
 *   1. The pilot is not circling (circling intervals excluded by caller).
 *   2. The smoothed |turnRate| does not exceed the circling threshold at
 *      the fix level (catches figure-8 lobes and partial-circle edges).
 *   3. Window-mean vario ≥ minMeanVarioMs ("not constantly sinking").
 *   4. Ground speed ≥ minGroundSpeedMs.
 *   5. Run duration ≥ minDurationSec after gap-bridging.
 *   6. Net altitude change ≥ −maxNetLossM (rules out long glide-outs).
 */
export function detectRidgeSoaring(
  fixes: Fix[],
  derived: Derived,
  startIdx: number,
  endIdx: number,
  circlingIntervals: [number, number][],
  bridgeGapSec: number = RIDGE_PARAMS.bridgeGapSec,
): RidgeSoar[] {
  const p = RIDGE_PARAMS;
  const thr = CIRCLING_PARAMS.circlingThresholdDegPerSec;
  const smoothHalf = CIRCLING_PARAMS.turnSmoothHalfSec;

  // Smoothed turn-rate for figure-8 exclusion (matches how phases.ts smooths it).
  const smoothedTR = computeWindowMean(derived.t, derived.turnRate, smoothHalf);

  // Build available mask: in active range, not inside a circling run, not
  // exhibiting a high |smoothed turn-rate| (figure-8 / partial-circle lobe).
  const available = new Uint8Array(fixes.length);
  for (let i = startIdx; i <= endIdx; i++) available[i] = 1;
  for (const [a, b] of circlingIntervals) {
    for (let i = a; i <= b; i++) available[i] = 0;
  }
  for (let i = startIdx; i <= endIdx; i++) {
    if (Math.abs(smoothedTR[i]) > thr) available[i] = 0;
  }

  // Precompute window-mean vario for each fix.
  const windowMeanVario = computeWindowMean(derived.t, derived.vario, p.windowSec / 2);

  // Mark candidate fixes.
  const candidate = new Uint8Array(fixes.length);
  for (let i = startIdx; i <= endIdx; i++) {
    if (
      available[i] &&
      windowMeanVario[i] >= p.minMeanVarioMs &&
      derived.groundSpeed[i] >= p.minGroundSpeedMs
    ) {
      candidate[i] = 1;
    }
  }

  // Group maximal runs of consecutive candidates.
  const rawRuns: { a: number; b: number }[] = [];
  let inRun = false;
  let runStart = startIdx;
  for (let i = startIdx; i <= endIdx + 1; i++) {
    const c = i <= endIdx ? candidate[i] : 0;
    if (c && !inRun) { runStart = i; inRun = true; }
    if (!c && inRun) { rawRuns.push({ a: runStart, b: i - 1 }); inRun = false; }
  }

  // Bridge consecutive runs with small gaps.
  const merged: { a: number; b: number }[] = [];
  for (const run of rawRuns) {
    const last = merged[merged.length - 1];
    if (last && derived.t[run.a] - derived.t[last.b] < bridgeGapSec) {
      last.b = run.b;
    } else {
      merged.push({ ...run });
    }
  }

  // Filter by minimum duration and net-altitude guard.
  const ridgeSoars: RidgeSoar[] = [];
  for (const { a, b } of merged) {
    const duration = derived.t[b] - derived.t[a];
    if (duration < p.minDurationSec) continue;

    const netAltChange = fixes[b].alt - fixes[a].alt;
    if (netAltChange < -p.maxNetLossM) continue;

    const trackDistance = derived.cumDist[b] - derived.cumDist[a];
    let altSum = 0;
    for (let i = a; i <= b; i++) altSum += fixes[i].alt;

    // Count reversals for informational display (no longer a qualification gate).
    const passes = countReversals(derived, a, b, 30, 120);

    ridgeSoars.push({
      kind: "ridge",
      startIdx: a,
      endIdx: b,
      startTime: fixes[a].time,
      endTime: fixes[b].time,
      duration,
      startAlt: fixes[a].alt,
      endAlt: fixes[b].alt,
      altChange: netAltChange,
      trackDistance,
      passes,
      avgAlt: altSum / (b - a + 1),
    });
  }

  return ridgeSoars;
}

/** Centred moving average of `y` over a ±`half` second window. */
function computeWindowMean(t: number[], y: number[], half: number): number[] {
  const n = y.length;
  const out = new Array<number>(n).fill(0);
  let lo = 0;
  let hi = 0;
  for (let i = 0; i < n; i++) {
    while (lo < n && t[lo] < t[i] - half) lo++;
    while (hi < n && t[hi] <= t[i] + half) hi++;
    let sum = 0;
    for (let j = lo; j < hi; j++) sum += y[j];
    out[i] = hi > lo ? sum / (hi - lo) : y[i];
  }
  return out;
}

/**
 * Count reversal events in a run [a,b]: each time the heading changes
 * by more than reversalDeg from the heading reversalWindowSec ago.
 * Informational only — not a qualification gate.
 */
function countReversals(
  d: Derived,
  a: number,
  b: number,
  windowSec: number,
  reversalDeg: number,
): number {
  let inReversal = false;
  let count = 0;
  for (let i = a; i <= b; i++) {
    let j = i;
    while (j > a && d.t[i] - d.t[j] < windowSec) j--;
    const diff = Math.abs(angleDiff(d.bearing[j], d.bearing[i]));
    const isReversal = diff > reversalDeg;
    if (isReversal && !inReversal) count++;
    inReversal = isReversal;
  }
  return count;
}
