// Colour scales shared by the map and barogram.

import type { Flight } from "./types";

export const PHASE_COLORS = {
  thermal: "#ff7043", // warm orange
  glide: "#42a5f5", // blue
  badturn: "#a78bfa", // violet — wasted circling
} as const;

/** Vario → colour buckets (m/s thresholds), cool = sink, warm = climb. */
const VARIO_STOPS: { max: number; color: string }[] = [
  { max: -3, color: "#1e3a8a" }, // strong sink — deep blue
  { max: -1.5, color: "#2563eb" }, // sink — blue
  { max: -0.4, color: "#38bdf8" }, // light sink — sky
  { max: 0.4, color: "#9ca3af" }, // ~level — grey
  { max: 1.5, color: "#fde047" }, // light climb — yellow
  { max: 3, color: "#f97316" }, // climb — orange
  { max: Infinity, color: "#dc2626" }, // strong climb — red
];

export function varioColor(ms: number): string {
  for (const stop of VARIO_STOPS) if (ms <= stop.max) return stop.color;
  return VARIO_STOPS[VARIO_STOPS.length - 1].color;
}

/** Legend entries for the vario scale (label + colour). */
export const VARIO_LEGEND = [
  { label: "↑ >3", color: "#dc2626" },
  { label: "1.5–3", color: "#f97316" },
  { label: "0.4–1.5", color: "#fde047" },
  { label: "≈0", color: "#9ca3af" },
  { label: "-1.5–-0.4", color: "#38bdf8" },
  { label: "-3–-1.5", color: "#2563eb" },
  { label: "↓ <-3", color: "#1e3a8a" },
];

export interface ColoredSegment {
  color: string;
  positions: [number, number][];
}

/**
 * Build vario-coloured polyline runs: consecutive fixes sharing a colour
 * bucket are merged into one polyline to keep the layer count manageable.
 */
export function buildVarioSegments(flight: Flight): ColoredSegment[] {
  const { fixes, derived } = flight;
  const segments: ColoredSegment[] = [];
  let current: ColoredSegment | null = null;
  let currentColor = "";

  for (let i = 0; i < fixes.length; i++) {
    const color = varioColor(derived.vario[i]);
    const pos: [number, number] = [fixes[i].lat, fixes[i].lon];
    if (color !== currentColor) {
      // Start a new run, repeating the previous point so runs join visually.
      if (current) current.positions.push(pos);
      current = { color, positions: [pos] };
      segments.push(current);
      currentColor = color;
    } else {
      current!.positions.push(pos);
    }
  }
  return segments;
}
