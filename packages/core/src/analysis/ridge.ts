import type { Derived, Fix, RidgeSoar } from "../types";
import { angleDiff, haversine } from "./geo";

export const RIDGE_PARAMS = {
  /** Sliding window (s) over which mean vario is evaluated. */
  windowSec: 30,
  /** Mean vario must be ≥ this (m/s): "holding or gaining". */
  minMeanVarioMs: -0.2,
  /** Must be moving (m/s). */
  minGroundSpeedMs: 3,
  /** A ridge run must last at least this long (s). */
  minDurationSec: 60,
  /** Bridge ridge runs separated by less than this (s). */
  bridgeGapSec: 10,
  /** Heading change exceeding this (deg) within reversalWindowSec = one pass reversal. */
  reversalDeg: 120,
  reversalWindowSec: 30,
  /** Pattern A: need at least this many pass reversals. */
  minReversals: 2,
  /**
   * Pattern B: bounding-box diagonal / along-track distance ≤ this means
   * the pilot covered distance while staying in a small area (confined flight).
   */
  maxConfinementRatio: 0.5,
};

/**
 * Detect ridge / slope soaring segments within the active range.
 *
 * Ridge soaring is sustained non-circling flight that maintains altitude,
 * detected from the GPS track without terrain data. Two patterns qualify:
 *   A. Back-and-forth reversals (heading changes ≥ 120° within 30 s).
 *   B. Confinement: bounding-box diagonal / along-track distance ≤ 0.5.
 *
 * This pass is additive — does not modify or replace thermals/glides.
 */
export function detectRidgeSoaring(
  fixes: Fix[],
  derived: Derived,
  startIdx: number,
  endIdx: number,
  circlingIntervals: [number, number][],
): RidgeSoar[] {
  const p = RIDGE_PARAMS;

  // Build a boolean mask: available[i] = in active range AND not circling.
  const available = new Uint8Array(fixes.length);
  for (let i = startIdx; i <= endIdx; i++) available[i] = 1;
  for (const [a, b] of circlingIntervals) {
    for (let i = a; i <= b; i++) available[i] = 0;
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

  // Group maximal runs of consecutive candidates and bridge short gaps.
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
    if (last && derived.t[run.a] - derived.t[last.b] < p.bridgeGapSec) {
      last.b = run.b;
    } else {
      merged.push({ ...run });
    }
  }

  // Filter by minimum duration and pattern test.
  const ridgeSoars: RidgeSoar[] = [];
  for (const { a, b } of merged) {
    const duration = derived.t[b] - derived.t[a];
    if (duration < p.minDurationSec) continue;

    const passes = countReversals(derived, a, b, p.reversalWindowSec, p.reversalDeg);
    const qualifiesA = passes >= p.minReversals;
    const qualifiesB = !qualifiesA && confinementRatio(fixes, derived, a, b) <= p.maxConfinementRatio;

    if (!qualifiesA && !qualifiesB) continue;

    const trackDistance = derived.cumDist[b] - derived.cumDist[a];
    let altSum = 0;
    for (let i = a; i <= b; i++) altSum += fixes[i].alt;

    ridgeSoars.push({
      kind: "ridge",
      startIdx: a,
      endIdx: b,
      startTime: fixes[a].time,
      endTime: fixes[b].time,
      duration,
      startAlt: fixes[a].alt,
      endAlt: fixes[b].alt,
      altChange: fixes[b].alt - fixes[a].alt,
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
 * by more than reversalDeg from the heading reversalWindowSec ago, a new
 * reversal event begins. Counts back-and-forth passes without double-counting.
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

/**
 * Bounding-box diagonal divided by along-track distance.
 * A value ≤ maxConfinementRatio means the pilot stayed in a small area.
 */
function confinementRatio(
  fixes: Fix[],
  d: Derived,
  a: number,
  b: number,
): number {
  const trackDist = d.cumDist[b] - d.cumDist[a];
  if (trackDist < 1) return 1;
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  for (let i = a; i <= b; i++) {
    if (fixes[i].lat < minLat) minLat = fixes[i].lat;
    if (fixes[i].lat > maxLat) maxLat = fixes[i].lat;
    if (fixes[i].lon < minLon) minLon = fixes[i].lon;
    if (fixes[i].lon > maxLon) maxLon = fixes[i].lon;
  }
  const diagonal = haversine(minLat, minLon, maxLat, maxLon);
  return diagonal / trackDist;
}
