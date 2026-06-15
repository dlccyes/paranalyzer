import type { TrackAdapter } from "@paranalyzer/app";

const TRACK_PREFIX = "paranalyzer-track:";

export const webTracks: TrackAdapter = {
  saveTrack: async (id, ext, text) => {
    const ref = `tracks/${id}.${ext}`;
    localStorage.setItem(TRACK_PREFIX + ref, text);
    return ref;
  },
  readTrack: async (ref) => {
    const text = localStorage.getItem(TRACK_PREFIX + ref);
    if (text == null) throw new Error(`Track not found: ${ref}`);
    return text;
  },
  deleteTrack: async (ref) => {
    localStorage.removeItem(TRACK_PREFIX + ref);
  },
  clearAll: async () => {
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(TRACK_PREFIX)) toRemove.push(key);
    }
    for (const key of toRemove) localStorage.removeItem(key);
  },
};
