import type { FlightRecord } from "./model";
import { ANALYSIS_VERSION } from "./model";
import { addFlight, findFlightByStartTime, addSiteOption, updateFlight } from "./db";

export interface ManualFlightInput {
  startTime: number;
  tzOffsetMinutes?: number;
  site?: string;
  glider?: string;
  pilot?: string;
  airtime: number;
  timeInThermal?: number;
  timeInGlide?: number;
  timeInRidge?: number;
  maxAlt?: number;
  maxAltGain?: number;
  maxClimb?: number;
  maxSink?: number;
  trackLength?: number;
  straightDistance?: number;
  freeDistance?: number;
  avgSpeed?: number;
  thermalCount?: number;
  glideCount?: number;
  ridgeCount?: number;
  windSpeed?: number;
  windFromDeg?: number;
  note?: string;
  xcontestUrl?: string;
  xcontestPoints?: number;
}

export interface ManualFlightResult {
  id: string;
  duplicate?: { existingId: string };
}

export async function addManualFlight(input: ManualFlightInput): Promise<ManualFlightResult> {
  const id = crypto.randomUUID();

  const existing = findFlightByStartTime(input.startTime);
  if (existing) {
    return { id, duplicate: { existingId: existing.id } };
  }

  if (input.site?.trim()) await addSiteOption(input.site.trim());

  const rec: FlightRecord = {
    id,
    importedAt: Date.now(),
    source: "manual",
    trackRef: "",
    analysisVersion: ANALYSIS_VERSION,
    manual: true,

    startTime: input.startTime,
    tzOffsetMinutes: input.tzOffsetMinutes,
    site: input.site?.trim() || undefined,
    glider: input.glider?.trim() || undefined,
    pilot: input.pilot?.trim() || undefined,

    airtime: input.airtime,
    timeInThermal: input.timeInThermal ?? 0,
    timeInGlide: input.timeInGlide ?? 0,
    timeInRidge: input.timeInRidge ?? 0,

    maxAlt: input.maxAlt ?? 0,
    maxAltGain: input.maxAltGain ?? 0,
    maxClimb: input.maxClimb ?? 0,
    maxSink: input.maxSink ?? 0,

    trackLength: input.trackLength ?? 0,
    straightDistance: input.straightDistance ?? 0,
    freeDistance: input.freeDistance ?? 0,
    avgSpeed: input.avgSpeed ?? 0,

    thermalCount: input.thermalCount ?? 0,
    glideCount: input.glideCount ?? 0,
    ridgeCount: input.ridgeCount ?? 0,

    windSpeed: input.windSpeed,
    windFromDeg: input.windFromDeg,

    note: input.note ?? "",
    xcontestUrl: input.xcontestUrl,
    xcontestPoints: input.xcontestPoints,
  };

  await addFlight(rec);
  return { id };
}

export async function updateManualFlight(id: string, input: ManualFlightInput): Promise<void> {
  if (input.site?.trim()) await addSiteOption(input.site.trim());

  const patch: Partial<FlightRecord> = {
    startTime: input.startTime,
    tzOffsetMinutes: input.tzOffsetMinutes,
    site: input.site?.trim() || undefined,
    glider: input.glider?.trim() || undefined,
    pilot: input.pilot?.trim() || undefined,
    airtime: input.airtime,
    timeInThermal: input.timeInThermal ?? 0,
    timeInGlide: input.timeInGlide ?? 0,
    timeInRidge: input.timeInRidge ?? 0,
    maxAlt: input.maxAlt ?? 0,
    maxAltGain: input.maxAltGain ?? 0,
    maxClimb: input.maxClimb ?? 0,
    maxSink: input.maxSink ?? 0,
    trackLength: input.trackLength ?? 0,
    straightDistance: input.straightDistance ?? 0,
    freeDistance: input.freeDistance ?? 0,
    avgSpeed: input.avgSpeed ?? 0,
    thermalCount: input.thermalCount ?? 0,
    glideCount: input.glideCount ?? 0,
    ridgeCount: input.ridgeCount ?? 0,
    windSpeed: input.windSpeed,
    windFromDeg: input.windFromDeg,
    note: input.note ?? "",
    xcontestUrl: input.xcontestUrl,
    xcontestPoints: input.xcontestPoints,
  };

  await updateFlight(id, patch);
}
