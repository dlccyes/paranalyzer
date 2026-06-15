import type { DbDocument, FlightRecord, Settings } from "./model";
import { DB_SCHEMA_VERSION, DEFAULT_SETTINGS } from "./model";

const DB_KEY = "paranalyzer-db";

let cache: DbDocument | null = null;

async function readRaw(): Promise<string | null> {
  return localStorage.getItem(DB_KEY);
}

async function writeRaw(json: string): Promise<void> {
  localStorage.setItem(DB_KEY, json);
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

export async function updateSite(id: string, site: string): Promise<void> {
  const doc = await loadDb();
  const rec = doc.flights.find((f) => f.id === id);
  if (rec) rec.site = site;
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
  doc.settings.sites = doc.settings.sites
    .map((s) => (s === oldName ? trimmed : s))
    .sort();
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
