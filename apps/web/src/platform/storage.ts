import type { StorageAdapter } from "@paranalyzer/app";

const DB_KEY = "paranalyzer-db";

export const webStorage: StorageAdapter = {
  readRaw: async () => localStorage.getItem(DB_KEY),
  writeRaw: async (json) => { localStorage.setItem(DB_KEY, json); },
};
