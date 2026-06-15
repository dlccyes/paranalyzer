export type UnitSystem = "metric" | "imperial";

const M_TO_FT = 3.280839895;
const M_TO_MI = 1 / 1609.344;
const M_TO_KM = 1 / 1000;
const MS_TO_KMH = 3.6;
const MS_TO_MPH = 2.236936292;
const MS_TO_FPM = 196.8503937;

function fmt(n: number, digits: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export interface UnitFormatter {
  system: UnitSystem;
  distance(meters: number, digits?: number): string;
  smallDistance(meters: number, digits?: number): string;
  altitude(meters: number): string;
  speed(ms: number, digits?: number): string;
  vario(ms: number): string;
  labels: {
    distance: string;
    smallDistance: string;
    altitude: string;
    speed: string;
    vario: string;
  };
}

export function makeFormatter(system: UnitSystem): UnitFormatter {
  const metric = system === "metric";
  return {
    system,
    distance: (m, digits = 2) =>
      `${fmt(m * (metric ? M_TO_KM : M_TO_MI), digits)} ${metric ? "km" : "mi"}`,
    smallDistance: (m, digits = 0) =>
      `${fmt(metric ? m : m * M_TO_FT, digits)} ${metric ? "m" : "ft"}`,
    altitude: (m) =>
      `${fmt(metric ? m : m * M_TO_FT, 0)} ${metric ? "m" : "ft"}`,
    speed: (ms, digits = 1) =>
      `${fmt(ms * (metric ? MS_TO_KMH : MS_TO_MPH), digits)} ${metric ? "km/h" : "mph"}`,
    vario: (ms) =>
      metric
        ? `${fmt(ms, 1)} m/s`
        : `${fmt(ms * MS_TO_FPM, 0)} ft/min`,
    labels: {
      distance: metric ? "km" : "mi",
      smallDistance: metric ? "m" : "ft",
      altitude: metric ? "m" : "ft",
      speed: metric ? "km/h" : "mph",
      vario: metric ? "m/s" : "ft/min",
    },
  };
}

/** Format a duration given in seconds as H:MM:SS or M:SS. */
export function formatDuration(seconds: number, forceHours = false): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  if (h > 0 || forceHours) return `${h}:${pad(m)}:${pad(sec)}`;
  return `${m}:${pad(sec)}`;
}

/** Format an epoch-ms instant as HH:MM:SS at the given tz offset (minutes). */
export function formatClock(epochMs: number, tzOffsetMinutes = 0): string {
  const d = new Date(epochMs + tzOffsetMinutes * 60_000);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

/** Format a date (epoch ms) at the given tz offset. fmt "dmy" → DD.MM.YYYY, "ymd" → YYYY-MM-DD. */
export function formatDate(epochMs: number, tzOffsetMinutes = 0, fmt: "dmy" | "ymd" = "dmy"): string {
  const d = new Date(epochMs + tzOffsetMinutes * 60_000);
  const pad = (n: number) => n.toString().padStart(2, "0");
  if (fmt === "ymd") {
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  return `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
}

/** Parse "H:MM" or "HH:MM" duration string → seconds. */
export function parseHhMm(str: string): number {
  const parts = str.split(":");
  if (parts.length !== 2) return 0;
  return (parseInt(parts[0]) || 0) * 3600 + (parseInt(parts[1]) || 0) * 60;
}

/** Format seconds → "H:MM" duration string. */
export function formatHhMm(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}:${m.toString().padStart(2, "0")}`;
}

/** Pretty tz offset like "UTC-07:00". */
export function formatTzOffset(tzOffsetMinutes: number): string {
  const sign = tzOffsetMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(tzOffsetMinutes);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `UTC${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}
