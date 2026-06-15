import type { FlightRecord } from "@paranalyzer/core";
export type { FlightRecord };
export { ANALYSIS_VERSION } from "@paranalyzer/core";

export const DB_SCHEMA_VERSION = 1;

export type FieldId =
  | "startTime" | "glider" | "site" | "pilot"
  | "airtime" | "timeInThermal" | "timeInRidge"
  | "maxAlt" | "maxAltGain" | "maxClimb" | "maxSink"
  | "trackLength" | "straightDistance" | "freeDistance" | "avgSpeed"
  | "thermalCount" | "glideCount" | "ridgeCount"
  | "windSpeed" | "windFromDeg" | "note";

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
  lastBackupAt?: number;
  drive?: { connected: boolean };
}

export interface DbDocument {
  schemaVersion: number;
  flights: FlightRecord[];
  settings: Settings;
}

export const ALL_FIELDS: FieldId[] = [
  "startTime", "glider", "site", "pilot",
  "airtime", "timeInThermal", "timeInRidge",
  "maxAlt", "maxAltGain", "maxClimb", "maxSink",
  "trackLength", "straightDistance", "freeDistance", "avgSpeed",
  "thermalCount", "glideCount", "ridgeCount",
  "windSpeed", "windFromDeg", "note",
];

export const FIELD_LABELS: Record<FieldId, string> = {
  startTime: "Date / Time",
  glider: "Glider",
  site: "Site",
  pilot: "Pilot",
  airtime: "Airtime",
  timeInThermal: "Time thermal",
  timeInRidge: "Time ridge",
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
};

const DEFAULT_VISIBLE: FieldId[] = [
  "startTime", "glider", "site", "airtime", "timeInThermal", "timeInRidge",
  "maxAltGain", "freeDistance", "note",
];

export const DEFAULT_SETTINGS: Settings = {
  columns: ALL_FIELDS.map((id) => ({ id, visible: DEFAULT_VISIBLE.includes(id) })),
  filters: [],
  sort: { field: "startTime", dir: "desc" },
  units: "metric",
};
