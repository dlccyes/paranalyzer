import { loadDb, saveDb, addFlight } from "./db";
import { saveTrack, readTrack } from "./trackStore";
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

function backupFileName(): string {
  const date = new Date();
  const tag = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
  return `paranalyzer-backup-${tag}.json`;
}

function downloadJson(fileName: string, json: string): void {
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function createBackupJson(): Promise<string> {
  const doc = await loadDb();
  const flights = await Promise.all(
    doc.flights.map(async (rec) => {
      const ext = rec.trackRef.split(".").pop() ?? "igc";
      let text = "";
      try { text = await readTrack(rec.trackRef); } catch { /* skip */ }
      return { ...rec, track: { ext, text } };
    }),
  );

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

export async function exportBackup(): Promise<string> {
  const json = await createBackupJson();
  downloadJson(backupFileName(), json);
  return json;
}

export async function importBackup(json: string, mode: "merge" | "replace"): Promise<{ imported: number; skipped: number }> {
  const bundle = JSON.parse(json) as BackupBundle;
  if (bundle.format !== "paranalyzer-backup") throw new Error("Not a Paranalyzer backup file");

  const doc = await loadDb();

  if (mode === "replace") {
    doc.flights = [];
  }

  const existingIds = new Set(doc.flights.map((f) => f.id));
  let imported = 0;
  let skipped = 0;

  for (const { track, ...rec } of bundle.flights) {
    if (mode === "merge" && existingIds.has(rec.id)) { skipped++; continue; }
    const trackRef = await saveTrack(rec.id, track.ext, track.text);
    await addFlight({ ...rec, trackRef });
    imported++;
  }

  if (bundle.settings) {
    doc.settings = { ...doc.settings, ...bundle.settings };
    await saveDb(doc);
  }

  return { imported, skipped };
}
