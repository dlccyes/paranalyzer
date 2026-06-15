import type { StorageAdapter } from "@paranalyzer/app";
import { idbGet, idbSet, STORES } from "./idb";

const DB_KEY = "paranalyzer-db";

export const webStorage: StorageAdapter = {
  readRaw: async () => {
    const stored = await idbGet(STORES.meta, DB_KEY);
    if (stored != null) return stored;

    const legacy = localStorage.getItem(DB_KEY);
    if (legacy != null) {
      await idbSet(STORES.meta, DB_KEY, legacy);
      localStorage.removeItem(DB_KEY);
    }
    return legacy;
  },
  writeRaw: async (json) => {
    await idbSet(STORES.meta, DB_KEY, json);
    localStorage.removeItem(DB_KEY);
  },
};
