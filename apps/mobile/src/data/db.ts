import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { Capacitor } from "@capacitor/core";
import type { DbDocument, FlightRecord, Settings } from "./model";
import { DB_SCHEMA_VERSION, DEFAULT_SETTINGS } from "./model";

const DB_PATH = "paranalyzer-db.json";
const isNative = Capacitor.isNativePlatform();

let cache: DbDocument | null = null;

async function readRaw(): Promise<string | null> {
  if (isNative) {
    try {
      const result = await Filesystem.readFile({ path: DB_PATH, directory: Directory.Data, encoding: Encoding.UTF8 });
      return result.data as string;
    } catch {
      return null;
    }
  }
  return localStorage.getItem("paranalyzer-db");
}

async function writeRaw(json: string): Promise<void> {
  if (isNative) {
    await Filesystem.writeFile({ path: DB_PATH, data: json, directory: Directory.Data, encoding: Encoding.UTF8 });
  } else {
    localStorage.setItem("paranalyzer-db", json);
  }
}

export async function loadDb(): Promise<DbDocument> {
  if (cache) return cache;
  const raw = await readRaw();
  if (raw) {
    try {
      const doc = JSON.parse(raw) as DbDocument;
      cache = { ...doc, settings: { ...DEFAULT_SETTINGS, ...doc.settings } };
      return cache;
    } catch {
      // fall through to seed
    }
  }
  cache = { schemaVersion: DB_SCHEMA_VERSION, flights: [], settings: { ...DEFAULT_SETTINGS } };
  await saveDb(cache);
  return cache;
}

export async function saveDb(doc: DbDocument): Promise<void> {
  cache = doc;
  await writeRaw(JSON.stringify(doc));
}

export function listFlights(): FlightRecord[] {
  return cache?.flights ?? [];
}

export function getFlight(id: string): FlightRecord | undefined {
  return cache?.flights.find((f) => f.id === id);
}

export async function addFlight(rec: FlightRecord): Promise<void> {
  const doc = await loadDb();
  doc.flights.push(rec);
  await saveDb(doc);
}

export async function updateNote(id: string, note: string): Promise<void> {
  const doc = await loadDb();
  const rec = doc.flights.find((f) => f.id === id);
  if (rec) rec.note = note;
  await saveDb(doc);
}

export async function deleteFlight(id: string): Promise<void> {
  const doc = await loadDb();
  doc.flights = doc.flights.filter((f) => f.id !== id);
  await saveDb(doc);
}

export async function getSettings(): Promise<Settings> {
  const doc = await loadDb();
  return doc.settings;
}

export async function saveSettings(settings: Settings): Promise<void> {
  const doc = await loadDb();
  doc.settings = settings;
  await saveDb(doc);
}
