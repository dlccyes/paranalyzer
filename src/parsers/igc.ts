import type { Fix, ParsedTrack } from "../types";

/**
 * Parse an IGC file (FAI / IGC flight recorder format).
 *
 * Handles the standard B-record fix layout plus I-record decimal extensions
 * (LAD/LOD) for extra lat/lon precision, and pulls pilot / glider / site /
 * date from the H records. Timezone is derived from XCTrack's LXCTDEVICE
 * block when present (so local time matches the device that recorded it).
 */
export function parseIGC(text: string, fileName?: string): ParsedTrack {
  const lines = text.split(/\r?\n/);

  let pilot: string | undefined;
  let gliderType: string | undefined;
  let site: string | undefined;
  let dateYMD: { y: number; m: number; d: number } | undefined;

  // I-record extension byte ranges (1-indexed, inclusive) keyed by 3-char code.
  const ext: Record<string, { start: number; end: number }> = {};
  const deviceLines: string[] = [];

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.length < 3) continue;
    const type = line[0];

    if (type === "H") {
      const code = line.substring(2, 5).toUpperCase();
      const value = line.includes(":")
        ? line.substring(line.indexOf(":") + 1).trim()
        : "";
      if (code === "PLT") pilot = value || pilot;
      else if (code === "GTY") gliderType = value || gliderType;
      else if (code === "SIT") site = value || site;
      else if (code === "DTE") {
        const digits = value.replace(/\D/g, "").slice(0, 6);
        if (digits.length === 6) {
          const d = +digits.slice(0, 2);
          const m = +digits.slice(2, 4);
          const yy = +digits.slice(4, 6);
          // IGC two-digit year: 80-99 → 19xx, else 20xx.
          const y = yy >= 80 ? 1900 + yy : 2000 + yy;
          dateYMD = { y, m, d };
        }
      }
    } else if (type === "I") {
      // I NN then triplets: SS EE CCC (1-indexed byte start/end + 3-char code).
      const count = parseInt(line.substring(1, 3), 10);
      let p = 3;
      for (let i = 0; i < count && p + 7 <= line.length; i++) {
        const start = parseInt(line.substring(p, p + 2), 10);
        const end = parseInt(line.substring(p + 2, p + 4), 10);
        const code = line.substring(p + 4, p + 7).toUpperCase();
        if (Number.isFinite(start) && Number.isFinite(end)) {
          ext[code] = { start, end };
        }
        p += 7;
      }
    } else if (line.startsWith("LXCTDEVICE")) {
      deviceLines.push(line.substring("LXCTDEVICE".length).trim());
    }
  }

  const ianaTz = extractXCTrackTimezone(deviceLines);

  const fixes: Fix[] = [];
  // Base date (UTC midnight) the HHMMSS times are added onto.
  let baseUTC = dateYMD
    ? Date.UTC(dateYMD.y, dateYMD.m - 1, dateYMD.d)
    : Date.UTC(1970, 0, 1);
  let prevSecOfDay = -1;

  for (const raw of lines) {
    if (raw[0] !== "B") continue;
    const line = raw.trimEnd();
    if (line.length < 35) continue;

    const hh = +line.substring(1, 3);
    const mm = +line.substring(3, 5);
    const ss = +line.substring(5, 7);
    const secOfDay = hh * 3600 + mm * 60 + ss;
    // Roll the base date forward if the clock wrapped past UTC midnight.
    if (prevSecOfDay >= 0 && secOfDay < prevSecOfDay - 60) {
      baseUTC += 86_400_000;
    }
    prevSecOfDay = secOfDay;

    const lat = parseCoord(line, 7, 9, ext.LAD, false);
    const lon = parseCoord(line, 15, 18, ext.LOD, true);
    if (lat === null || lon === null) continue;

    const valid = line[24];
    const pressureAlt = parseInt(line.substring(25, 30), 10);
    const gpsAlt = parseInt(line.substring(30, 35), 10);
    // Prefer GPS altitude; fall back to pressure if GPS is missing/zeroed.
    const alt =
      Number.isFinite(gpsAlt) && gpsAlt !== 0 ? gpsAlt : pressureAlt;
    if (!Number.isFinite(alt)) continue;
    if (valid === "V" && alt === 0) continue; // skip clearly bad fixes

    fixes.push({
      time: baseUTC + secOfDay * 1000,
      lat,
      lon,
      alt,
      pressureAlt: Number.isFinite(pressureAlt) ? pressureAlt : undefined,
    });
  }

  const tzOffsetMinutes =
    ianaTz && fixes.length
      ? tzOffsetForInstant(ianaTz, fixes[0].time)
      : undefined;

  return {
    meta: {
      source: "igc",
      fileName,
      pilot,
      gliderType,
      site,
      tzOffsetMinutes,
    },
    fixes,
  };
}

/**
 * Parse a lat or lon from a B-record.
 * @param degStart index of the degrees field
 * @param minStart index where the integer-minutes field begins
 */
function parseCoord(
  line: string,
  degStart: number,
  minStart: number,
  extension: { start: number; end: number } | undefined,
  isLon: boolean,
): number | null {
  const degLen = isLon ? 3 : 2;
  const deg = parseInt(line.substring(degStart, degStart + degLen), 10);
  const minInt = line.substring(minStart, minStart + 2);
  let minDec = line.substring(minStart + 2, minStart + 5); // thousandths
  // Append any high-precision decimal-minute digits (LAD/LOD).
  if (extension) {
    const extra = line.substring(extension.start - 1, extension.end);
    if (/^\d+$/.test(extra)) minDec += extra;
  }
  const hemi = line[minStart + 5];
  if (!/^\d+$/.test(minInt) || !/^\d+$/.test(minDec) || !Number.isFinite(deg)) {
    return null;
  }
  const minutes = parseInt(minInt, 10) + parseInt(minDec, 10) / 10 ** minDec.length;
  let value = deg + minutes / 60;
  if (hemi === "S" || hemi === "W") value = -value;
  return value;
}

/** Concatenate + base64-decode XCTrack device lines and pull out the IANA tz. */
function extractXCTrackTimezone(deviceLines: string[]): string | null {
  if (!deviceLines.length) return null;
  try {
    const b64 = deviceLines.join("");
    const json = typeof atob === "function" ? atob(b64) : "";
    const match = json.match(/"timezone"\s*:\s*"([^"]+)"/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * Compute the offset (minutes east of UTC) for an IANA timezone at a given
 * instant, DST-aware, using the platform Intl database.
 */
function tzOffsetForInstant(timeZone: string, epochMs: number): number | undefined {
  try {
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const parts = dtf.formatToParts(new Date(epochMs));
    const m: Record<string, number> = {};
    for (const p of parts) if (p.type !== "literal") m[p.type] = +p.value;
    const asUTC = Date.UTC(
      m.year,
      m.month - 1,
      m.day,
      m.hour === 24 ? 0 : m.hour,
      m.minute,
      m.second,
    );
    return Math.round((asUTC - epochMs) / 60_000);
  } catch {
    return undefined;
  }
}
