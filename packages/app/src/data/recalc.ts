import { parseTrack, buildFlightRecord } from "@paranalyzer/core";
import { listFlights, updateFlight, getSettings } from "./db";
import { analyzeWithSettings } from "./analyze";
import { readTrack } from "./trackStore";

export interface RecalcResult {
  updated: number;
  failed: number;
}

/**
 * Re-analyse every stored flight from its saved track text and write back all
 * derived fields. User-entered fields (note, site, xcontestUrl) are preserved.
 */
export async function recalcAll(onProgress?: (done: number, total: number) => void): Promise<RecalcResult> {
  const flights = listFlights();
  const settings = await getSettings();
  let updated = 0;
  let failed = 0;

  for (let i = 0; i < flights.length; i++) {
    const rec = flights[i];
    try {
      const text = await readTrack(rec.trackRef);
      const parsed = parseTrack(rec.fileName ?? `flight.${rec.source}`, text);
      const analysed = await analyzeWithSettings(parsed, settings);
      const recomputed = buildFlightRecord(parsed, analysed, {
        id: rec.id,
        trackRef: rec.trackRef,
        importedAt: rec.importedAt,
        site: rec.site,
        note: rec.note,
        xcontestUrl: rec.xcontestUrl,
      });
      await updateFlight(rec.id, recomputed);
      updated++;
    } catch {
      failed++;
    }
    onProgress?.(i + 1, flights.length);
  }

  return { updated, failed };
}
