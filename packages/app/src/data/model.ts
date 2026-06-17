import type { AnalyzeOptions, FlightRecord } from "@paranalyzer/core";
export type { FlightRecord };
export { ANALYSIS_VERSION } from "@paranalyzer/core";

export const DB_SCHEMA_VERSION = 1;

export type FieldId =
  | "startTime" | "glider" | "site" | "pilot"
  | "airtime" | "timeInThermal" | "timeInGlide" | "timeInRidge"
  | "maxAlt" | "maxAltGain" | "maxClimb" | "maxSink"
  | "trackLength" | "straightDistance" | "freeDistance" | "avgSpeed"
  | "thermalCount" | "glideCount" | "ridgeCount"
  | "windSpeed" | "windFromDeg" | "note" | "xcontestPoints" | "xcontestUrl";

export type FilterFieldType =
  | "text" | "date" | "duration" | "altitude" | "distance"
  | "speed" | "vario" | "count" | "deg" | "enum";

export const FIELD_TYPES: Record<FieldId, FilterFieldType> = {
  startTime: "date",
  glider: "enum",
  site: "enum",
  pilot: "text",
  airtime: "duration",
  timeInThermal: "duration",
  timeInGlide: "duration",
  timeInRidge: "duration",
  maxAlt: "altitude",
  maxAltGain: "altitude",
  maxClimb: "vario",
  maxSink: "vario",
  trackLength: "distance",
  straightDistance: "distance",
  freeDistance: "distance",
  avgSpeed: "speed",
  thermalCount: "count",
  glideCount: "count",
  ridgeCount: "count",
  windSpeed: "speed",
  windFromDeg: "deg",
  note: "text",
  xcontestPoints: "count",
  xcontestUrl: "text",
};

export interface ColumnConfig {
  id: FieldId;
  visible: boolean;
}

export type FilterOp =
  | "contains" | "equals"
  | "gte" | "lte" | "between"
  | "dateOnOrAfter" | "dateOnOrBefore";

export interface FilterRule {
  field: FieldId;
  op: FilterOp;
  value: string | number | [number, number];
}

export interface SortRule {
  field: FieldId;
  dir: "asc" | "desc";
}

export interface Settings {
  columns: ColumnConfig[];
  filters: FilterRule[];
  sort: SortRule;
  units: "metric" | "imperial";
  dateFormat: "dmy" | "ymd";
  sites: string[];
  /** Bridge ridge-soaring runs separated by less than this many seconds. */
  ridgeBridgeGapSec: number;
  /** Bridge thermal/circling runs separated by this many seconds or less. */
  thermalBridgeGapSec: number;
  /** Minimum number of turns for a climbing circle to count as a thermal. */
  thermalMinTurns: number;
  lastBackupAt?: number;
  drive?: { connected: boolean };
  mapBase?: "street" | "satellite";
}

export interface DbDocument {
  schemaVersion: number;
  flights: FlightRecord[];
  settings: Settings;
}

export const ALL_FIELDS: FieldId[] = [
  "startTime", "glider", "site", "pilot",
  "airtime", "timeInThermal", "timeInGlide", "timeInRidge",
  "maxAlt", "maxAltGain", "maxClimb", "maxSink",
  "trackLength", "straightDistance", "freeDistance", "avgSpeed",
  "thermalCount", "glideCount", "ridgeCount",
  "windSpeed", "windFromDeg", "xcontestPoints", "xcontestUrl", "note",
];

export const FIELD_LABELS: Record<FieldId, string> = {
  startTime: "Date / Time",
  glider: "Glider",
  site: "Site",
  pilot: "Pilot",
  airtime: "Airtime",
  timeInThermal: "Time in thermal",
  timeInGlide: "Time in glide",
  timeInRidge: "Time in ridge soaring",
  maxAlt: "Max alt",
  maxAltGain: "Alt gain",
  maxClimb: "Max climb",
  maxSink: "Max sink",
  trackLength: "Track",
  straightDistance: "Straight",
  freeDistance: "Free dist",
  avgSpeed: "Avg speed",
  thermalCount: "Thermals",
  glideCount: "Glides",
  ridgeCount: "Ridge runs",
  windSpeed: "Wind spd",
  windFromDeg: "Wind dir",
  note: "Note",
  xcontestPoints: "XC points",
  xcontestUrl: "XC link",
};

export const DEFAULT_VISIBLE: FieldId[] = [
  "startTime", "glider", "site", "airtime", "timeInThermal", "timeInGlide", "timeInRidge",
  "maxAltGain", "freeDistance", "note",
];

export const DEFAULT_SETTINGS: Settings = {
  columns: ALL_FIELDS.map((id) => ({ id, visible: DEFAULT_VISIBLE.includes(id) })),
  filters: [],
  sort: { field: "startTime", dir: "desc" },
  units: "metric",
  dateFormat: "dmy",
  sites: [],
  ridgeBridgeGapSec: 20,
  thermalBridgeGapSec: 10,
  thermalMinTurns: 1,
};

/** Map user settings onto the core analysis pipeline's tunable options. */
export function analyzeOptions(settings: Settings): AnalyzeOptions {
  return {
    ridgeBridgeGapSec: settings.ridgeBridgeGapSec,
    thermalBridgeGapSec: settings.thermalBridgeGapSec,
    thermalMinTurns: settings.thermalMinTurns,
  };
}
