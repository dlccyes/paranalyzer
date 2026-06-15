import type { BadTurn, Derived, Fix, Glide, Phase, Thermal } from "../types";
import { angleDiff, bearing, haversine } from "./geo";
import { estimateWind } from "./wind";

const DEG = Math.PI / 180;

export const PARAMS = {
  turnSmoothHalfSec: 4,
  circlingThresholdDegPerSec: 6,
  bridgeGapSec: 8,
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
  signedTurn: number;
  turns: number;
  direction: 1 | -1;
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
): CirclingResult {
  const str = smoothTurnRate(derived, startIdx, endIdx);
  const runs = findCirclingRuns(derived, str, startIdx, endIdx);

  const significant = runs.filter((r) => r.turns >= PARAMS.minSignificantTurns);

  const thermals: Thermal[] = [];
  const badTurns: BadTurn[] = [];
  for (const run of runs) {
    const c = buildCircling(fixes, derived, str, run);
    const climbing = c.climbRate > PARAMS.climbThresholdMs;
    if (climbing && run.turns >= thermalMinTurns) {
      thermals.push({ kind: "thermal", climb: c.altChange, ...c });
    } else if (!climbing && run.turns > PARAMS.badTurnMinTurns) {
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
): PhaseResult {
  const { thermals, badTurns, significantIntervals } =
    detectCircling(fixes, derived, startIdx, endIdx, thermalMinTurns);
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
  d: Derived,
  str: number[],
  s: number,
  e: number,
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
    const sameDir =
      last && Math.sign(avg(str, last.a, last.b)) === Math.sign(avg(str, run.a, run.b));
    if (last && sameDir && d.t[run.a] - d.t[last.b] < PARAMS.bridgeGapSec) {
      last.b = run.b;
    } else {
      merged.push({ ...run });
    }
  }

  return merged.map(({ a: ra, b: rb }) => {
    let signed = 0;
    for (let i = ra + 1; i <= rb; i++) signed += angleDiff(d.bearing[i - 1], d.bearing[i]);
    return {
      a: ra,
      b: rb,
      signedTurn: signed,
      turns: Math.abs(signed) / 360,
      direction: signed >= 0 ? 1 : -1,
    };
  });
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
    direction: run.direction,
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

function avg(arr: number[], a: number, b: number): number {
  let s = 0;
  for (let i = a; i <= b; i++) s += arr[i];
  return s / Math.max(1, b - a + 1);
}
