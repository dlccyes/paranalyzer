import type { Flight } from "./types";

export const PHASE_COLORS = {
  thermal: "#ff7043",
  glide: "#42a5f5",
  badturn: "#a78bfa",
  ridge: "#34d399",
} as const;

const VARIO_STOPS: { max: number; color: string }[] = [
  { max: -3, color: "#1e3a8a" },
  { max: -1.5, color: "#2563eb" },
  { max: -0.4, color: "#38bdf8" },
  { max: 0.4, color: "#9ca3af" },
  { max: 1.5, color: "#fde047" },
  { max: 3, color: "#f97316" },
  { max: Infinity, color: "#dc2626" },
];

export function varioColor(ms: number): string {
  for (const stop of VARIO_STOPS) if (ms <= stop.max) return stop.color;
  return VARIO_STOPS[VARIO_STOPS.length - 1].color;
}

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

export function buildVarioSegments(flight: Flight): ColoredSegment[] {
  const { fixes, derived } = flight;
  const segments: ColoredSegment[] = [];
  let current: ColoredSegment | null = null;
  let currentColor = "";

  for (let i = 0; i < fixes.length; i++) {
    const color = varioColor(derived.vario[i]);
    const pos: [number, number] = [fixes[i].lat, fixes[i].lon];
    if (color !== currentColor) {
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
