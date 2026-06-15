// Geodesy helpers. All distances in metres, all angles in degrees unless noted.

export const EARTH_RADIUS_M = 6_371_000;

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

/** Great-circle distance between two lat/lon points, in metres (haversine). */
export function haversine(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLat = (lat2 - lat1) * DEG;
  const dLon = (lon2 - lon1) * DEG;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * DEG) * Math.cos(lat2 * DEG) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Initial bearing (course) from point 1 to point 2 in degrees [0,360). */
export function bearing(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const φ1 = lat1 * DEG;
  const φ2 = lat2 * DEG;
  const dλ = (lon2 - lon1) * DEG;
  const y = Math.sin(dλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dλ);
  return (Math.atan2(y, x) * RAD + 360) % 360;
}

/**
 * Smallest signed difference b - a, normalised to (-180, 180].
 * Positive means turning clockwise (to the right) from a to b.
 */
export function angleDiff(a: number, b: number): number {
  let d = (b - a) % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}

/** Average of a list of compass directions (degrees), vector-averaged. */
export function averageBearing(degs: number[]): number {
  let s = 0;
  let c = 0;
  for (const d of degs) {
    s += Math.sin(d * DEG);
    c += Math.cos(d * DEG);
  }
  return (Math.atan2(s, c) * RAD + 360) % 360;
}

/** Convert a compass bearing to the nearest 16-point name (e.g. "NNE"). */
export function compassName(deg: number): string {
  const names = [
    "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
    "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
  ];
  return names[Math.round(((deg % 360) / 22.5)) % 16];
}

/**
 * Project lat/lon to local east/north metres relative to an origin.
 * Good enough for the small areas a single flight covers.
 */
export function toLocalEN(
  lat: number,
  lon: number,
  lat0: number,
  lon0: number,
): { e: number; n: number } {
  const e = (lon - lon0) * DEG * EARTH_RADIUS_M * Math.cos(lat0 * DEG);
  const n = (lat - lat0) * DEG * EARTH_RADIUS_M;
  return { e, n };
}
