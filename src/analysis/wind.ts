import type { Derived, WindEstimate } from "../types";

/**
 * Estimate wind from a circling segment.
 *
 * While thermalling at a steady airspeed, the GPS ground-velocity vectors
 * (vEast, vNorth) trace a circle in velocity space. The circle's centre is the
 * wind vector (the air mass's velocity over the ground); its radius is the
 * pilot's airspeed. We fit that circle with the algebraic Kåsa least-squares
 * method and convert the centre to a meteorological "from" direction.
 *
 * Returns null if the sample is too small or the fit is degenerate.
 */
export function estimateWind(
  derived: Derived,
  startIdx: number,
  endIdx: number,
): WindEstimate | null {
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = startIdx; i <= endIdx; i++) {
    const x = derived.ve[i];
    const y = derived.vn[i];
    if (Number.isFinite(x) && Number.isFinite(y)) {
      xs.push(x);
      ys.push(y);
    }
  }
  if (xs.length < 8) return null;

  const fit = fitCircle(xs, ys);
  if (!fit) return null;

  const { cx, cy } = fit;
  const speed = Math.hypot(cx, cy);
  // Direction the air moves TOWARD, then flip to the FROM convention.
  const toward = (Math.atan2(cx, cy) * 180) / Math.PI;
  const fromDeg = (toward + 180 + 360) % 360;
  // Reject absurd results (e.g. >40 m/s ≈ 144 km/h) as fit failures.
  if (!Number.isFinite(speed) || speed > 40) return null;
  return { speed, fromDeg };
}

/** Average several wind estimates as vectors (weighted by sample count). */
export function averageWind(
  winds: { wind: WindEstimate | null; weight?: number }[],
): WindEstimate | null {
  let ex = 0;
  let ny = 0;
  let total = 0;
  for (const { wind, weight = 1 } of winds) {
    if (!wind) continue;
    const toward = ((wind.fromDeg + 180) * Math.PI) / 180;
    ex += Math.sin(toward) * wind.speed * weight;
    ny += Math.cos(toward) * wind.speed * weight;
    total += weight;
  }
  if (total === 0) return null;
  ex /= total;
  ny /= total;
  const speed = Math.hypot(ex, ny);
  const toward = (Math.atan2(ex, ny) * 180) / Math.PI;
  return { speed, fromDeg: (toward + 180 + 360) % 360 };
}

/** Kåsa algebraic circle fit. Returns centre (cx, cy) and radius r. */
function fitCircle(
  xs: number[],
  ys: number[],
): { cx: number; cy: number; r: number } | null {
  const n = xs.length;
  let mx = 0;
  let my = 0;
  for (let i = 0; i < n; i++) {
    mx += xs[i];
    my += ys[i];
  }
  mx /= n;
  my /= n;

  let Suu = 0, Svv = 0, Suv = 0, Suuu = 0, Svvv = 0, Suvv = 0, Svuu = 0;
  for (let i = 0; i < n; i++) {
    const u = xs[i] - mx;
    const v = ys[i] - my;
    Suu += u * u;
    Svv += v * v;
    Suv += u * v;
    Suuu += u * u * u;
    Svvv += v * v * v;
    Suvv += u * v * v;
    Svuu += v * u * u;
  }

  const det = Suu * Svv - Suv * Suv;
  if (Math.abs(det) < 1e-9) return null;

  const c1 = 0.5 * (Suuu + Suvv);
  const c2 = 0.5 * (Svvv + Svuu);
  const uc = (c1 * Svv - c2 * Suv) / det;
  const vc = (Suu * c2 - Suv * c1) / det;

  const cx = uc + mx;
  const cy = vc + my;
  const r = Math.sqrt(uc * uc + vc * vc + (Suu + Svv) / n);
  return { cx, cy, r };
}
