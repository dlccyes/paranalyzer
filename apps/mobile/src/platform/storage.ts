import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { Capacitor } from "@capacitor/core";
import type { StorageAdapter } from "@paranalyzer/app";

const DB_PATH = "paranalyzer-db.json";
const isNative = Capacitor.isNativePlatform();

export const mobileStorage: StorageAdapter = {
  readRaw: async () => {
    if (isNative) {
      try {
        const result = await Filesystem.readFile({
          path: DB_PATH,
          directory: Directory.Data,
          encoding: Encoding.UTF8,
        });
        return result.data as string;
      } catch {
        return null;
      }
    }
    return localStorage.getItem("paranalyzer-db");
  },

  writeRaw: async (json) => {
    if (isNative) {
      await Filesystem.writeFile({
        path: DB_PATH,
        data: json,
        directory: Directory.Data,
        encoding: Encoding.UTF8,
      });
    } else {
      localStorage.setItem("paranalyzer-db", json);
    }
  },
};
