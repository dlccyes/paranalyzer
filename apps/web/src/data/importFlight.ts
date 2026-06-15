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

function pickFiles(): Promise<FileList | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = ".igc,.gpx,.kml,text/plain,application/octet-stream";
    input.style.display = "none";
    document.body.appendChild(input);
    input.addEventListener("change", () => {
      const files = input.files;
      input.remove();
      resolve(files);
    }, { once: true });
    input.click();
  });
}

/** Pick one or more track files and import them. Returns [{id, error?}]. */
export async function importFlights(): Promise<ImportResult[]> {
  const files = await pickFiles();
  if (!files) return [];

  const results: ImportResult[] = [];
  for (const file of Array.from(files)) {
    results.push(await importOne(file.name, await file.text()));
  }
  return results;
}
