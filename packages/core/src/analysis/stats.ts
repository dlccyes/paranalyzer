import type { Derived, Fix, FlightStats, RidgeSoar, Thermal } from "../types";
import { haversine } from "./geo";
import { averageWind } from "./wind";

const MOVE_THRESHOLD = 2.0;
const CLIMB_WINDOW_SEC = 30;

export function detectActiveRange(d: Derived): [number, number] {
  const n = d.groundSpeed.length;
  let start = 0;
  let end = n - 1;
  for (let i = 0; i < n; i++) {
    if (d.groundSpeed[i] > MOVE_THRESHOLD) { start = i; break; }
  }
  for (let i = n - 1; i >= 0; i--) {
    if (d.groundSpeed[i] > MOVE_THRESHOLD) { end = i; break; }
  }
  if (end <= start) { start = 0; end = n - 1; }
  return [start, end];
}

export function computeStats(
  fixes: Fix[],
  d: Derived,
  start: number,
  end: number,
  thermals: Thermal[],
  ridgeSoars: RidgeSoar[],
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

  const timeInThermal = thermals.reduce((s, t) => s + t.duration, 0);
  const timeInRidge = ridgeSoars.reduce((s, r) => s + r.duration, 0);

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
    wind: averageWind(thermals.map((t) => ({ wind: t.wind, weight: t.turns }))),
    timeInThermal,
    timeInRidge,
  };
}

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

export function freeDistance(
  fixes: Fix[],
  start: number,
  end: number,
  maxLegs = 4,
  maxPoints = 250,
): number {
  const span = end - start;
  if (span <= 1) return 0;
  const step = Math.max(1, Math.ceil(span / maxPoints));
  const idx: number[] = [];
  for (let i = start; i <= end; i += step) idx.push(i);
  if (idx[idx.length - 1] !== end) idx.push(end);

  const m = idx.length;
  const lat = idx.map((i) => fixes[i].lat);
  const lon = idx.map((i) => fixes[i].lon);

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
