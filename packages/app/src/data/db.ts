import type { DbDocument, FlightRecord, Settings } from "./model";
import { DB_SCHEMA_VERSION, DEFAULT_SETTINGS } from "./model";
import { getPlatform } from "../platform";

let cache: DbDocument | null = null;

export async function loadDb(): Promise<DbDocument> {
  if (cache) return cache;
  const raw = await getPlatform().storage.readRaw();
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
  await getPlatform().storage.writeRaw(JSON.stringify(doc));
}

export function listFlights(): FlightRecord[] {
  return cache?.flights ?? [];
}

export function getFlight(id: string): FlightRecord | undefined {
  return cache?.flights.find((f) => f.id === id);
}

export function findFlightByStartTime(startTime: number): FlightRecord | undefined {
  return cache?.flights.find((f) => f.startTime === startTime);
}

export async function addFlight(rec: FlightRecord): Promise<void> {
  const doc = await loadDb();
  doc.flights.push(rec);
  await saveDb(doc);
}

export async function updateFlight(id: string, patch: Partial<FlightRecord>): Promise<void> {
  const doc = await loadDb();
  const rec = doc.flights.find((f) => f.id === id);
  if (rec) Object.assign(rec, patch);
  await saveDb(doc);
}

export async function updateNote(id: string, note: string): Promise<void> {
  return updateFlight(id, { note });
}

export async function updateSite(id: string, site: string): Promise<void> {
  return updateFlight(id, { site });
}

export async function updateXcontestPoints(id: string, points: number | undefined): Promise<void> {
  return updateFlight(id, { xcontestPoints: points });
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

export async function addSiteOption(name: string): Promise<string[]> {
  const doc = await loadDb();
  const trimmed = name.trim();
  if (trimmed && !doc.settings.sites.includes(trimmed)) {
    doc.settings.sites = [...doc.settings.sites, trimmed].sort();
  }
  await saveDb(doc);
  return doc.settings.sites;
}

export async function renameSiteOption(oldName: string, newName: string): Promise<string[]> {
  const doc = await loadDb();
  const trimmed = newName.trim();
  if (!trimmed || trimmed === oldName) return doc.settings.sites;
  doc.settings.sites = doc.settings.sites.map((s) => (s === oldName ? trimmed : s)).sort();
  for (const f of doc.flights) {
    if (f.site === oldName) f.site = trimmed;
  }
  await saveDb(doc);
  return doc.settings.sites;
}

export async function removeSiteOption(name: string): Promise<string[]> {
  const doc = await loadDb();
  doc.settings.sites = doc.settings.sites.filter((s) => s !== name);
  for (const f of doc.flights) {
    if (f.site === name) f.site = "";
  }
  await saveDb(doc);
  return doc.settings.sites;
}

export async function clearAllData(): Promise<void> {
  const doc = await loadDb();
  await getPlatform().tracks.clearAll();
  const prev = doc.settings;
  cache = {
    schemaVersion: DB_SCHEMA_VERSION,
    flights: [],
    settings: { ...DEFAULT_SETTINGS, drive: prev.drive },
  };
  await getPlatform().storage.writeRaw(JSON.stringify(cache));
}
