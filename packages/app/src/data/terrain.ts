import type { Fix, GroundProfile } from "@paranalyzer/core";
import { getFlight, updateFlight } from "./db";

const SAMPLE_N = 256;
const CHUNK = 100;

async function fetchElevations(points: { lat: number; lon: number }[]): Promise<number[]> {
  const out: number[] = [];
  for (let i = 0; i < points.length; i += CHUNK) {
    const chunk = points.slice(i, i + CHUNK);
    const lats = chunk.map((p) => p.lat).join(",");
    const lons = chunk.map((p) => p.lon).join(",");
    const res = await fetch(
      `https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lons}`,
    );
    if (!res.ok) throw new Error(`Elevation API ${res.status}`);
    const data = (await res.json()) as { elevation: number[] };
    out.push(...data.elevation);
  }
  return out;
}

/** Linear-interpolate the sparse ground profile to a per-fix array. */
export function buildGroundAlt(
  fixes: Fix[],
  profile: GroundProfile,
  start: number,
  end: number,
): number[] {
  const { sampleIdx, elev } = profile;
  const result = new Array<number>(fixes.length).fill(0);
  for (let j = start; j <= end; j++) {
    let lo = 0;
    let hi = sampleIdx.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sampleIdx[mid] < j) lo = mid + 1;
      else hi = mid;
    }
    if (lo === 0 || sampleIdx[lo] === j) {
      result[j] = elev[lo];
    } else {
      const i0 = lo - 1;
      const i1 = lo;
      const t = (j - sampleIdx[i0]) / (sampleIdx[i1] - sampleIdx[i0]);
      result[j] = elev[i0] + t * (elev[i1] - elev[i0]);
    }
  }
  return result;
}

/** Fetch and cache a ground elevation profile for a flight. Returns null on failure. */
export async function ensureGroundProfile(
  id: string,
  fixes: Fix[],
  start: number,
  end: number,
): Promise<GroundProfile | null> {
  const rec = getFlight(id);
  if (rec?.groundProfile) return rec.groundProfile;

  try {
    const total = end - start + 1;
    const step = Math.max(1, Math.floor(total / SAMPLE_N));
    const sampleIdx: number[] = [];
    for (let i = start; i <= end; i += step) sampleIdx.push(i);
    if (sampleIdx[sampleIdx.length - 1] !== end) sampleIdx.push(end);

    const points = sampleIdx.map((i) => ({ lat: fixes[i].lat, lon: fixes[i].lon }));
    const elevs = await fetchElevations(points);

    const profile: GroundProfile = { sampleIdx, elev: elevs };
    await updateFlight(id, { groundProfile: profile });
    return profile;
  } catch {
    return null;
  }
}
