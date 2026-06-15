import type { Flight, ParsedTrack } from "./types";

export const ANALYSIS_VERSION = 1;

export interface FlightRecord {
  id: string;
  importedAt: number;
  source: "igc" | "gpx" | "kml";
  fileName?: string;
  trackRef: string;
  analysisVersion: number;

  startTime: number;
  tzOffsetMinutes?: number;
  pilot?: string;
  site?: string;
  glider?: string;

  airtime: number;
  timeInThermal: number;
  timeInRidge: number;

  maxAlt: number;
  maxAltGain: number;
  maxClimb: number;
  maxSink: number;

  trackLength: number;
  straightDistance: number;
  freeDistance: number;
  avgSpeed: number;

  thermalCount: number;
  glideCount: number;
  ridgeCount: number;

  windSpeed?: number;
  windFromDeg?: number;

  note: string;
  xcontestPoints?: number;
  xcontestUrl?: string;
}

export function buildFlightRecord(
  parsed: ParsedTrack,
  flight: Flight,
  opts: { id: string; trackRef: string; importedAt?: number },
): FlightRecord {
  const { meta } = parsed;
  const { stats, thermals, glides, ridgeSoars } = flight;

  return {
    id: opts.id,
    importedAt: opts.importedAt ?? Date.now(),
    source: meta.source,
    fileName: meta.fileName,
    trackRef: opts.trackRef,
    analysisVersion: ANALYSIS_VERSION,

    startTime: stats.start,
    tzOffsetMinutes: meta.tzOffsetMinutes,
    pilot: meta.pilot,
    site: meta.site,
    glider: meta.gliderType,

    airtime: stats.airtime,
    timeInThermal: stats.timeInThermal,
    timeInRidge: stats.timeInRidge,

    maxAlt: stats.maxAlt,
    maxAltGain: stats.maxAltGain,
    maxClimb: stats.maxClimb,
    maxSink: stats.maxSink,

    trackLength: stats.trackLength,
    straightDistance: stats.straightDistance,
    freeDistance: stats.freeDistance,
    avgSpeed: stats.avgSpeed,

    thermalCount: thermals.length,
    glideCount: glides.length,
    ridgeCount: ridgeSoars.length,

    windSpeed: stats.wind?.speed,
    windFromDeg: stats.wind?.fromDeg,

    note: "",
  };
}
