import type { TrackAdapter } from "@paranalyzer/app";
import { idbClear, idbDelete, idbGet, idbSet, STORES } from "./idb";

const TRACK_PREFIX = "paranalyzer-track:";

export const webTracks: TrackAdapter = {
  saveTrack: async (id, ext, text) => {
    const ref = `tracks/${id}.${ext}`;
    await idbSet(STORES.tracks, ref, text);
    localStorage.removeItem(TRACK_PREFIX + ref);
    return ref;
  },
  readTrack: async (ref) => {
    const stored = await idbGet(STORES.tracks, ref);
    if (stored != null) return stored;

    const legacyKey = TRACK_PREFIX + ref;
    const legacy = localStorage.getItem(legacyKey);
    if (legacy != null) {
      await idbSet(STORES.tracks, ref, legacy);
      localStorage.removeItem(legacyKey);
      return legacy;
    }
    throw new Error(`Track not found: ${ref}`);
  },
  deleteTrack: async (ref) => {
    await idbDelete(STORES.tracks, ref);
    localStorage.removeItem(TRACK_PREFIX + ref);
  },
  clearAll: async () => {
    await idbClear(STORES.tracks);
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(TRACK_PREFIX)) toRemove.push(key);
    }
    for (const key of toRemove) localStorage.removeItem(key);
  },
};
