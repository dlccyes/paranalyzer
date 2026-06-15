import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { Capacitor } from "@capacitor/core";
import type { TrackAdapter } from "@paranalyzer/app";

const isNative = Capacitor.isNativePlatform();
const webStore = new Map<string, string>();

export const mobileTracks: TrackAdapter = {
  saveTrack: async (id, ext, text) => {
    const ref = `tracks/${id}.${ext}`;
    if (isNative) {
      await Filesystem.writeFile({
        path: ref,
        data: text,
        directory: Directory.Data,
        encoding: Encoding.UTF8,
        recursive: true,
      });
    } else {
      webStore.set(ref, text);
    }
    return ref;
  },

  readTrack: async (ref) => {
    if (isNative) {
      const result = await Filesystem.readFile({
        path: ref,
        directory: Directory.Data,
        encoding: Encoding.UTF8,
      });
      return result.data as string;
    }
    const text = webStore.get(ref);
    if (text == null) throw new Error(`Track not found: ${ref}`);
    return text;
  },

  deleteTrack: async (ref) => {
    if (isNative) {
      try {
        await Filesystem.deleteFile({ path: ref, directory: Directory.Data });
      } catch {
        // already gone
      }
    } else {
      webStore.delete(ref);
    }
  },

  clearAll: async () => {
    if (isNative) {
      try {
        await Filesystem.rmdir({ path: "tracks", directory: Directory.Data, recursive: true });
      } catch {
        // directory may not exist
      }
    } else {
      webStore.clear();
    }
  },
};
