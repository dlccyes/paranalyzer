import type { Derived, Fix, FlightStats, Thermal } from "../types";
import { haversine } from "./geo";
import { averageWind } from "./wind";

/** Minimum sustained ground speed (m/s) that counts as airborne movement. */
const MOVE_THRESHOLD = 2.0;

/**
 * Window (seconds) over which max climb / sink are averaged. Reported climb
 * rates are *sustained* values, not instantaneous vario spikes — this matches
 * how XContest and similar platforms report them.
 */
const CLIMB_WINDOW_SEC = 30;

/**
 * Find the airborne range [start, end] by trimming stationary time on launch
 * and at the landing zone.
 */
export function detectActiveRange(d: Derived): [number, number] {
  const n = d.groundSpeed.length;
  let start = 0;
  let end = n - 1;
  for (let i = 0; i < n; i++) {
    if (d.groundSpeed[i] > MOVE_THRESHOLD) {
      start = i;
      break;
    }
  }
  for (let i = n - 1; i >= 0; i--) {
    if (d.groundSpeed[i] > MOVE_THRESHOLD) {
      end = i;
      break;
    }
  }
  if (end <= start) {
    start = 0;
    end = n - 1;
  }
  return [start, end];
}

export function computeStats(
  fixes: Fix[],
  d: Derived,
  start: number,
  end: number,
  thermals: Thermal[],
): FlightStats {
  let maxAlt = -Infinity;
  let minAlt = Infinity;
  let maxAltGain = 0;
  let runningMin = fixes[start].alt;

  for (let i = start; i <= end; i++) {
    const alt = fixes[i].alt;
    if (alt > maxAlt) maxAlt = alt;
    if (alt < minAlt) minAlt = alt;
    if (alt < runningMin) runningMin = alt;
    if (alt - runningMin > maxAltGain) maxAltGain = alt - runningMin;
  }

  const { maxClimb, maxSink } = sustainedClimbSink(fixes, d, start, end);

  const airtime = d.t[end] - d.t[start];
  const trackLength = d.cumDist[end] - d.cumDist[start];
  const straightDistance = haversine(
    fixes[start].lat, fixes[start].lon, fixes[end].lat, fixes[end].lon,
  );

  return {
    start: fixes[start].time,
    end: fixes[end].time,
    airtime,
    maxAlt,
    minAlt,
    maxAltGain,
    maxClimb,
    maxSink,
    trackLength,
    straightDistance,
    freeDistance: freeDistance(fixes, start, end),
    avgSpeed: airtime > 0 ? trackLength / airtime : 0,
    wind: averageWind(
      thermals.map((t) => ({ wind: t.wind, weight: t.turns })),
    ),
  };
}

/**
 * Best sustained climb and worst sustained sink, each averaged over a
 * ~{@link CLIMB_WINDOW_SEC}-second window. Returns m/s (sink is positive).
 */
function sustainedClimbSink(
  fixes: Fix[],
  d: Derived,
  start: number,
  end: number,
): { maxClimb: number; maxSink: number } {
  let maxClimb = 0;
  let maxSink = 0;
  let j = start;
  for (let i = start; i <= end; i++) {
    if (j < i) j = i;
    while (j < end && d.t[j] - d.t[i] < CLIMB_WINDOW_SEC) j++;
    const span = d.t[j] - d.t[i];
    if (span <= 0) continue;
    const rate = (fixes[j].alt - fixes[i].alt) / span;
    if (rate > maxClimb) maxClimb = rate;
    if (-rate > maxSink) maxSink = -rate;
  }
  return { maxClimb, maxSink };
}

/**
 * Open ("free") distance: the longest path through up to 3 intermediate
 * turnpoints (5 ordered points incl. start and end). Solved with dynamic
 * programming on a downsampled set of fixes — O(legs · m²).
 */
export function freeDistance(
  fixes: Fix[],
  start: number,
  end: number,
  maxLegs = 4,
  maxPoints = 250,
): number {
  // Evenly sample the active range down to at most `maxPoints` fixes.
  const span = end - start;
  if (span <= 1) return 0;
  const step = Math.max(1, Math.ceil(span / maxPoints));
  const idx: number[] = [];
  for (let i = start; i <= end; i += step) idx.push(i);
  if (idx[idx.length - 1] !== end) idx.push(end);

  const m = idx.length;
  const lat = idx.map((i) => fixes[i].lat);
  const lon = idx.map((i) => fixes[i].lon);

  // dp[j] = best distance of a path ending at sample j using `leg` legs.
  let dp = new Array<number>(m).fill(0);
  let best = 0;
  for (let leg = 1; leg <= maxLegs; leg++) {
    const next = new Array<number>(m).fill(0);
    for (let j = 1; j < m; j++) {
      let bestTo = 0;
      for (let i = 0; i < j; i++) {
        const cand = dp[i] + haversine(lat[i], lon[i], lat[j], lon[j]);
        if (cand > bestTo) bestTo = cand;
      }
      next[j] = bestTo;
      if (bestTo > best) best = bestTo;
    }
    dp = next;
  }
  return best;
}
