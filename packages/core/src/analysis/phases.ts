import type { BadTurn, Derived, Fix, Glide, Phase, Thermal } from "../types";
import { angleDiff, bearing, haversine } from "./geo";
import { estimateWind } from "./wind";

const DEG = Math.PI / 180;

export const PARAMS = {
  turnSmoothHalfSec: 4,
  circlingThresholdDegPerSec: 6,
  /** Minimum straight-line step (m) between heading samples when counting turns.
   *  Rejects GPS jitter at near-zero ground speed, which otherwise inflates the count. */
  minTurnStepM: 6,
  bridgeGapSec: 10,
  minSignificantTurns: 0.75,
  /** Minimum turns for a climbing circle to count as a thermal. Configurable. */
  thermalMinTurns: 1,
  climbThresholdMs: 0.1,
  badTurnMinTurns: 1,
  minGlideSec: 20,
  minGlideDistM: 200,
};

interface CirclingRun {
  a: number;
  b: number;
  turns: number;
}

export interface CirclingResult {
  thermals: Thermal[];
  badTurns: BadTurn[];
  /** All significant circling runs (≥ minSignificantTurns). Used as exclusion zones for ridge and glide detection. */
  significantIntervals: [number, number][];
}

export interface PhaseResult {
  thermals: Thermal[];
  badTurns: BadTurn[];
  glides: Glide[];
  phases: Phase[];
}

/** Pass 1: detect all circling events (thermals + bad turns) and their bounding intervals. */
export function detectCircling(
  fixes: Fix[],
  derived: Derived,
  startIdx: number,
  endIdx: number,
  thermalMinTurns: number = PARAMS.thermalMinTurns,
  bridgeGapSec: number = PARAMS.bridgeGapSec,
): CirclingResult {
  const str = smoothTurnRate(derived, startIdx, endIdx);
  const runs = findCirclingRuns(fixes, derived, str, startIdx, endIdx, bridgeGapSec);

  const significant = runs.filter((r) => r.turns >= PARAMS.minSignificantTurns);

  const thermals: Thermal[] = [];
  const badTurns: BadTurn[] = [];
  for (const run of runs) {
    const dur = derived.t[run.b] - derived.t[run.a];
    const climbing =
      dur > 0 && (fixes[run.b].alt - fixes[run.a].alt) / dur > PARAMS.climbThresholdMs;
    if (climbing && run.turns >= thermalMinTurns) {
      // Trim the thermal to its genuinely-climbing core so lead-in and post-peak
      // sink (which the pilot circled through) are not reported as part of the climb.
      const [ca, cb] = climbingCore(fixes, run.a, run.b);
      const core = { a: ca, b: cb, turns: countTurns(fixes, ca, cb) };
      const c = buildCircling(fixes, derived, str, core);
      thermals.push({ kind: "thermal", climb: c.altChange, ...c });
    } else if (!climbing && run.turns > PARAMS.badTurnMinTurns) {
      const c = buildCircling(fixes, derived, str, run);
      badTurns.push({ kind: "badturn", ...c });
    }
  }

  return {
    thermals,
    badTurns,
    significantIntervals: significant.map((r): [number, number] => [r.a, r.b]),
  };
}

/**
 * Pass 3: detect glides as the gaps between all excluded intervals.
 * excludeIntervals should be the union of significantIntervals (from pass 1)
 * and ridge intervals (from pass 2) so the three phase types are mutually exclusive.
 */
export function detectGlides(
  fixes: Fix[],
  derived: Derived,
  startIdx: number,
  endIdx: number,
  excludeIntervals: [number, number][],
  thermals: Thermal[],
): Glide[] {
  const glides: Glide[] = [];
  let cursor = startIdx;
  const boundaries = excludeIntervals
    .map(([a, b]) => ({ a, b }))
    .sort((x, y) => x.a - y.a);

  for (const { a, b } of boundaries) {
    if (a - 1 >= cursor) {
      maybePushGlide(glides, fixes, derived, cursor, a);
    }
    cursor = Math.max(cursor, b);
  }
  if (endIdx > cursor) {
    maybePushGlide(glides, fixes, derived, cursor, endIdx);
  }

  assignGlideWinds(glides, thermals);
  return glides;
}

/** Convenience wrapper that runs both circling and glide detection without ridge. */
export function detectPhases(
  fixes: Fix[],
  derived: Derived,
  startIdx: number,
  endIdx: number,
  thermalMinTurns: number = PARAMS.thermalMinTurns,
  bridgeGapSec: number = PARAMS.bridgeGapSec,
): PhaseResult {
  const { thermals, badTurns, significantIntervals } =
    detectCircling(fixes, derived, startIdx, endIdx, thermalMinTurns, bridgeGapSec);
  const glides = detectGlides(fixes, derived, startIdx, endIdx, significantIntervals, thermals);

  const phases: Phase[] = [...thermals, ...badTurns, ...glides].sort(
    (x, y) => x.startIdx - y.startIdx,
  );

  return { thermals, badTurns, glides, phases };
}

function smoothTurnRate(d: Derived, s: number, e: number): number[] {
  const out = d.turnRate.slice();
  const half = PARAMS.turnSmoothHalfSec;
  let lo = s;
  let hi = s;
  for (let i = s; i <= e; i++) {
    while (lo < e && d.t[lo] < d.t[i] - half) lo++;
    while (hi <= e && d.t[hi] <= d.t[i] + half) hi++;
    let sum = 0;
    for (let j = lo; j < hi; j++) sum += d.turnRate[j];
    out[i] = hi > lo ? sum / (hi - lo) : d.turnRate[i];
  }
  return out;
}

function findCirclingRuns(
  fixes: Fix[],
  d: Derived,
  str: number[],
  s: number,
  e: number,
  bridgeGapSec: number,
): CirclingRun[] {
  const thr = PARAMS.circlingThresholdDegPerSec;
  const raw: { a: number; b: number }[] = [];
  let a = -1;
  for (let i = s; i <= e; i++) {
    const circling = Math.abs(str[i]) > thr;
    if (circling && a < 0) a = i;
    if (!circling && a >= 0) {
      raw.push({ a, b: i - 1 });
      a = -1;
    }
  }
  if (a >= 0) raw.push({ a, b: e });

  const merged: { a: number; b: number }[] = [];
  for (const run of raw) {
    const last = merged[merged.length - 1];
    if (last && d.t[run.a] - d.t[last.b] <= bridgeGapSec) {
      last.b = run.b;
    } else {
      merged.push({ ...run });
    }
  }

  return merged.map(({ a: ra, b: rb }) => ({
    a: ra,
    b: rb,
    turns: countTurns(fixes, ra, rb),
  }));
}

/**
 * Cumulative heading change over [a, b] expressed in full turns (total absolute
 * rotation / 360). Heading is only sampled once the glider has actually moved
 * `minTurnStepM` metres from the previous sample, so GPS jitter while nearly
 * stationary — where per-fix displacement is the size of the position error — no
 * longer accumulates spurious rotation.
 */
function countTurns(fixes: Fix[], a: number, b: number): number {
  const minStep = PARAMS.minTurnStepM;
  let total = 0;
  let anchor = a;
  let prev: number | null = null;
  for (let i = a + 1; i <= b; i++) {
    if (haversine(fixes[anchor].lat, fixes[anchor].lon, fixes[i].lat, fixes[i].lon) < minStep) {
      continue;
    }
    const brg = bearing(fixes[anchor].lat, fixes[anchor].lon, fixes[i].lat, fixes[i].lon);
    if (prev !== null) total += Math.abs(angleDiff(prev, brg));
    prev = brg;
    anchor = i;
  }
  return total / 360;
}

/**
 * The maximum-altitude-gain sub-interval of [a, b] — a thermal's genuinely-climbing
 * core. Trims lead-in before the climb starts and any post-peak sink the pilot
 * circled through, so an embedded/trailing sink isn't counted as part of the climb.
 */
function climbingCore(fixes: Fix[], a: number, b: number): [number, number] {
  let lo = a;
  let best = -Infinity;
  let ca = a;
  let cb = a;
  for (let i = a; i <= b; i++) {
    if (fixes[i].alt < fixes[lo].alt) lo = i;
    const gain = fixes[i].alt - fixes[lo].alt;
    if (gain > best) {
      best = gain;
      ca = lo;
      cb = i;
    }
  }
  return [ca, cb];
}

type CirclingMetrics = Omit<Thermal, "kind" | "climb">;

function buildCircling(
  fixes: Fix[],
  d: Derived,
  str: number[],
  run: CirclingRun,
): CirclingMetrics {
  const { a, b } = run;
  const duration = d.t[b] - d.t[a];
  const altChange = fixes[b].alt - fixes[a].alt;
  const trackDistance = d.cumDist[b] - d.cumDist[a];

  let radSum = 0;
  let radCount = 0;
  for (let i = a; i <= b; i++) {
    const omega = Math.abs(str[i]) * DEG;
    if (omega > 0.05 && Number.isFinite(d.groundSpeed[i])) {
      radSum += d.groundSpeed[i] / omega;
      radCount++;
    }
  }
  const avgRadius = radCount ? radSum / radCount : 0;

  return {
    startIdx: a,
    endIdx: b,
    startTime: fixes[a].time,
    endTime: fixes[b].time,
    duration,
    startAlt: fixes[a].alt,
    endAlt: fixes[b].alt,
    altChange,
    trackDistance,
    straightDistance: haversine(fixes[a].lat, fixes[a].lon, fixes[b].lat, fixes[b].lon),
    turns: run.turns,
    climbRate: duration > 0 ? altChange / duration : 0,
    avgRadius,
    wind: estimateWind(d, a, b),
  };
}

function maybePushGlide(
  glides: Glide[],
  fixes: Fix[],
  d: Derived,
  a: number,
  b: number,
): void {
  if (b <= a) return;
  const duration = d.t[b] - d.t[a];
  const straightDistance = haversine(
    fixes[a].lat, fixes[a].lon, fixes[b].lat, fixes[b].lon,
  );
  if (duration < PARAMS.minGlideSec || straightDistance < PARAMS.minGlideDistM) {
    return;
  }
  const trackDistance = d.cumDist[b] - d.cumDist[a];
  const altChange = fixes[b].alt - fixes[a].alt;
  const altLost = -altChange;

  glides.push({
    kind: "glide",
    startIdx: a,
    endIdx: b,
    startTime: fixes[a].time,
    endTime: fixes[b].time,
    duration,
    startAlt: fixes[a].alt,
    endAlt: fixes[b].alt,
    altChange,
    trackDistance,
    straightDistance,
    course: bearing(fixes[a].lat, fixes[a].lon, fixes[b].lat, fixes[b].lon),
    groundSpeed: duration > 0 ? trackDistance / duration : 0,
    totalSink: altLost,
    avgSinkRate: duration > 0 ? altLost / duration : 0,
    glideRatio: altLost > 1 ? trackDistance / altLost : null,
    wind: null,
  });
}

function assignGlideWinds(glides: Glide[], thermals: Thermal[]): void {
  const withWind = thermals.filter((t) => t.wind);
  if (!withWind.length) return;
  for (const g of glides) {
    const mid = (g.startTime + g.endTime) / 2;
    let best: Thermal | null = null;
    let bestDist = Infinity;
    for (const t of withWind) {
      const tMid = (t.startTime + t.endTime) / 2;
      const dist = Math.abs(tMid - mid);
      if (dist < bestDist) {
        bestDist = dist;
        best = t;
      }
    }
    g.wind = best?.wind ?? null;
  }
}
