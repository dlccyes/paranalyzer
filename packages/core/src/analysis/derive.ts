import type { Derived, Fix } from "../types";
import { angleDiff, bearing, haversine } from "./geo";

const DEG = Math.PI / 180;

export function computeDerived(fixes: Fix[]): Derived {
  const n = fixes.length;
  const t = new Array<number>(n);
  const dt = new Array<number>(n);
  const cumDist = new Array<number>(n);
  const brg = new Array<number>(n);
  const ve = new Array<number>(n);
  const vn = new Array<number>(n);
  const rawSpeed = new Array<number>(n);

  const t0 = fixes[0].time;
  cumDist[0] = 0;
  dt[0] = 0;

  for (let i = 0; i < n; i++) {
    t[i] = (fixes[i].time - t0) / 1000;
    if (i > 0) {
      dt[i] = Math.max((fixes[i].time - fixes[i - 1].time) / 1000, 0.001);
      cumDist[i] = cumDist[i - 1] + haversine(
        fixes[i - 1].lat, fixes[i - 1].lon, fixes[i].lat, fixes[i].lon,
      );
    }
  }

  for (let i = 0; i < n - 1; i++) {
    const d = haversine(fixes[i].lat, fixes[i].lon, fixes[i + 1].lat, fixes[i + 1].lon);
    const segDt = Math.max((fixes[i + 1].time - fixes[i].time) / 1000, 0.001);
    const b = bearing(fixes[i].lat, fixes[i].lon, fixes[i + 1].lat, fixes[i + 1].lon);
    const speed = d / segDt;
    brg[i] = b;
    rawSpeed[i] = speed;
    ve[i] = speed * Math.sin(b * DEG);
    vn[i] = speed * Math.cos(b * DEG);
  }
  brg[n - 1] = brg[n - 2] ?? 0;
  rawSpeed[n - 1] = rawSpeed[n - 2] ?? 0;
  ve[n - 1] = ve[n - 2] ?? 0;
  vn[n - 1] = vn[n - 2] ?? 0;

  const turnRate = new Array<number>(n).fill(0);
  for (let i = 1; i < n; i++) {
    turnRate[i] = angleDiff(brg[i - 1], brg[i]) / dt[i];
  }

  const groundSpeed = movingAverage(t, rawSpeed, 2);
  const vario = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    vario[i] = slopeInWindow(t, fixes, i, 2.5);
  }

  return { t, dt, cumDist, groundSpeed, bearing: brg, turnRate, vario, ve, vn };
}

function movingAverage(t: number[], y: number[], half: number): number[] {
  const n = y.length;
  const out = new Array<number>(n);
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

function slopeInWindow(t: number[], fixes: Fix[], i: number, half: number): number {
  const n = fixes.length;
  let lo = i;
  let hi = i;
  while (lo > 0 && t[i] - t[lo - 1] <= half) lo--;
  while (hi < n - 1 && t[hi + 1] - t[i] <= half) hi++;
  const count = hi - lo + 1;
  if (count < 2) return 0;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let j = lo; j <= hi; j++) {
    const x = t[j];
    const y = fixes[j].alt;
    sx += x; sy += y; sxx += x * x; sxy += x * y;
  }
  const denom = count * sxx - sx * sx;
  if (Math.abs(denom) < 1e-9) return 0;
  return (count * sxy - sx * sy) / denom;
}
