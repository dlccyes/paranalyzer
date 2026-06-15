import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "leaflet/dist/leaflet.css";
import "@paranalyzer/ui/styles.css";
import "@paranalyzer/app/shell.css";
import { initPlatform, AppRoot } from "@paranalyzer/app";
import { webStorage } from "./platform/storage";
import { webTracks } from "./platform/tracks";
import { webPickTrackFiles, webSaveBackupFile, webPickBackupFile } from "./platform/files";
import { webDrive } from "./platform/drive";

const APK_URL =
  (import.meta.env.VITE_APK_URL as string | undefined) ??
  "https://github.com/dlccyes/paranalyzer/releases/download/android-latest/paranalyzer.apk";

initPlatform({
  storage: webStorage,
  tracks: webTracks,
  pickTrackFiles: webPickTrackFiles,
  saveBackupFile: webSaveBackupFile,
  pickBackupFile: webPickBackupFile,
  drive: webDrive,
  openExternal: (url) => { window.open(url, "_blank", "noopener,noreferrer"); return Promise.resolve(); },
  apkUrl: APK_URL,
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppRoot />
  </StrictMode>,
);
