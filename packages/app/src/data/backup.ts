import { loadDb, saveDb, addFlight } from "./db";
import { saveTrack, readTrack } from "./trackStore";
import { getPlatform } from "../platform";
import type { FlightRecord, Settings } from "./model";
import { ANALYSIS_VERSION } from "./model";

export interface BackupBundle {
  format: "paranalyzer-backup";
  version: 1;
  exportedAt: number;
  app: { name: "Paranalyzer"; analysisVersion: number };
  settings: Settings;
  flights: Array<FlightRecord & { track: { ext: string; text: string } }>;
}

export async function createBackupJson(
  onProgress?: (done: number, total: number) => void,
): Promise<string> {
  const doc = await loadDb();
  const flights: Array<FlightRecord & { track: { ext: string; text: string } }> = [];
  for (let i = 0; i < doc.flights.length; i++) {
    const rec = doc.flights[i];
    const ext = rec.trackRef.split(".").pop() ?? "igc";
    let text = "";
    try { text = await readTrack(rec.trackRef); } catch { /* skip */ }
    flights.push({ ...rec, track: { ext, text } });
    onProgress?.(i + 1, doc.flights.length);
  }

  const bundle = {
    format: "paranalyzer-backup" as const,
    version: 1 as const,
    exportedAt: Date.now(),
    app: { name: "Paranalyzer" as const, analysisVersion: ANALYSIS_VERSION },
    settings: doc.settings,
    flights,
  };

  return JSON.stringify(bundle, null, 2);
}

export async function exportBackup(): Promise<void> {
  const json = await createBackupJson();
  const date = new Date();
  const tag = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
  await getPlatform().saveBackupFile(`paranalyzer-backup-${tag}.json`, json);
}

export async function importBackup(
  json: string,
  mode: "merge" | "replace",
  onProgress?: (done: number, total: number) => void,
): Promise<{ imported: number; skipped: number }> {
  const bundle = JSON.parse(json) as BackupBundle;
  if (bundle.format !== "paranalyzer-backup") throw new Error("Not a Paranalyzer backup file");

  const doc = await loadDb();

  if (mode === "replace") {
    doc.flights = [];
  }

  const existingIds = new Set(doc.flights.map((f) => f.id));
  let imported = 0;
  let skipped = 0;
  const total = bundle.flights.length;

  for (let i = 0; i < bundle.flights.length; i++) {
    const { track, ...rec } = bundle.flights[i];
    if (mode === "merge" && existingIds.has(rec.id)) { skipped++; onProgress?.(i + 1, total); continue; }
    if (rec.manual) {
      await addFlight({ ...rec, trackRef: "" });
    } else {
      const trackRef = await saveTrack(rec.id, track.ext, track.text);
      await addFlight({ ...rec, trackRef });
    }
    imported++;
    onProgress?.(i + 1, total);
  }

  if (bundle.settings) {
    doc.settings = { ...doc.settings, ...bundle.settings };
    await saveDb(doc);
  }

  return { imported, skipped };
}
