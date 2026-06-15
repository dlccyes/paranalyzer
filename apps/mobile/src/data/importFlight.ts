import { FilePicker } from "@capawesome/capacitor-file-picker";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { parseTrack, analyzeFlight, buildFlightRecord } from "@paranalyzer/core";
import { addFlight } from "./db";
import { saveTrack } from "./trackStore";

function extOf(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "igc";
}

interface ImportResult {
  id: string;
  error?: string;
}

async function importOne(name: string, text: string): Promise<ImportResult> {
  const id = crypto.randomUUID();
  const ext = extOf(name);
  try {
    const trackRef = await saveTrack(id, ext, text);
    const parsed = parseTrack(name, text);
    const flight = analyzeFlight(parsed);
    const rec = buildFlightRecord(parsed, flight, { id, trackRef });
    await addFlight(rec);
    return { id };
  } catch (err) {
    return { id, error: err instanceof Error ? err.message : "Import failed" };
  }
}

/** Pick one or more track files and import them. Returns [{id, error?}]. */
export async function importFlights(): Promise<ImportResult[]> {
  const result = await FilePicker.pickFiles({
    types: ["application/octet-stream", "text/plain", "text/*"],
    limit: 0,
    readData: true,
  });

  const results: ImportResult[] = [];
  for (const file of result.files) {
    const name = file.name ?? "flight.igc";
    let text: string;
    if (file.data) {
      text = atob(file.data);
    } else if (file.path) {
      const r = await Filesystem.readFile({ path: file.path, directory: Directory.Data, encoding: Encoding.UTF8 });
      text = r.data as string;
    } else {
      results.push({ id: crypto.randomUUID(), error: "Could not read file data" });
      continue;
    }
    results.push(await importOne(name, text));
  }
  return results;
}
