import { solver, scoringRules } from "igc-xc-score";
import type { Fix } from "../types";

export interface XcScore {
  /** XContest points (coefficient × distance). */
  points: number;
  /** Scored distance in metres. */
  distanceM: number;
  /** Discipline name, e.g. "Free flight", "Flat triangle", "FAI triangle". */
  type: string;
}

/** Maximum solver iterations — generous enough for all real tracks. */
const MAX_CYCLES = 100_000;

/**
 * Score a flight using the official World XContest algorithm (igc-xc-score).
 * Adapts our Fix[] to the library's expected shape and runs the solver to
 * completion under a cycle budget. Returns zero on error or empty track.
 */
export function scoreFlight(fixes: Fix[], startIdx: number, endIdx: number): XcScore {
  const slice = fixes.slice(startIdx, endIdx + 1);
  if (slice.length < 5) return { points: 0, distanceM: 0, type: "" };

  try {
    const flight = {
      date: new Date(slice[0].time).toISOString().split("T")[0],
      numFlight: null,
      pilot: null,
      copilot: null,
      gliderType: null,
      registration: null,
      callsign: null,
      competitionClass: null,
      site: null,
      loggerId: null,
      loggerManufacturer: "",
      loggerType: null,
      firmwareVersion: null,
      hardwareVersion: null,
      task: null,
      dataRecords: [],
      security: null,
      errors: [],
      fixes: slice.map((f) => ({
        timestamp: f.time,
        time: new Date(f.time).toISOString().split("T")[1],
        latitude: f.lat,
        longitude: f.lon,
        valid: true,
        pressureAltitude: f.pressureAlt ?? null,
        gpsAltitude: f.alt,
        extensions: {},
        fixAccuracy: null,
        enl: null,
      })),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const it = solver(flight as any, scoringRules.XContest, { maxcycle: MAX_CYCLES });
    let r: IteratorResult<unknown, unknown>;
    do { r = it.next(); } while (!r.done);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = r.value as any;

    const points = typeof s?.score === "number" ? Math.round(s.score * 100) / 100 : 0;
    const distanceM = typeof s?.scoreInfo?.distance === "number" ? s.scoreInfo.distance * 1000 : 0;
    const type: string = s?.opt?.scoring?.name ?? "";

    return { points, distanceM, type };
  } catch {
    return { points: 0, distanceM: 0, type: "" };
  }
}
