import { parseTrack, analyzeFlight, buildFlightRecord } from "@paranalyzer/core";
import { addFlight, findFlightByStartTime, deleteFlight, listFlights } from "./db";
import { saveTrack, deleteTrack } from "./trackStore";
import { addSiteOption } from "./db";
import { getPlatform } from "../platform";
import type { FlightRecord } from "./model";

function extOf(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "igc";
}

export interface DuplicateInfo {
  existingId: string;
  pendingRec: FlightRecord;
  trackText: string;
  trackExt: string;
}

export interface ImportResult {
  id: string;
  error?: string;
  duplicate?: DuplicateInfo;
}

export async function commitDuplicate(
  info: DuplicateInfo,
  choice: "replace" | "keep",
): Promise<string> {
  if (choice === "replace") {
    const existing = listFlights().find((f) => f.id === info.existingId);
    if (existing) await deleteTrack(existing.trackRef);
    await deleteFlight(info.existingId);
  }
  const trackRef = await saveTrack(info.pendingRec.id, info.trackExt, info.trackText);
  await addFlight({ ...info.pendingRec, trackRef });
  return info.pendingRec.id;
}

async function importOne(name: string, text: string): Promise<ImportResult> {
  const id = crypto.randomUUID();
  const ext = extOf(name);
  try {
    const parsed = parseTrack(name, text);
    const flight = analyzeFlight(parsed);
    const rec = buildFlightRecord(parsed, flight, { id, trackRef: "" });

    if (rec.site) await addSiteOption(rec.site);

    const existing = findFlightByStartTime(rec.startTime);
    if (existing) {
      return { id, duplicate: { existingId: existing.id, pendingRec: rec, trackText: text, trackExt: ext } };
    }

    const trackRef = await saveTrack(id, ext, text);
    await addFlight({ ...rec, trackRef });
    return { id };
  } catch (err) {
    return { id, error: err instanceof Error ? err.message : "Import failed" };
  }
}

export async function importFlights(): Promise<ImportResult[]> {
  const files = await getPlatform().pickTrackFiles();
  const results: ImportResult[] = [];
  for (const { name, text } of files) {
    results.push(await importOne(name, text));
  }
  return results;
}
