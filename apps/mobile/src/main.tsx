import "leaflet/dist/leaflet.css";
import "@paranalyzer/ui/styles.css";
import "@paranalyzer/app/shell.css";
import React from "react";
import ReactDOM from "react-dom/client";
import { App as CapApp } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { initPlatform, AppRoot } from "@paranalyzer/app";
import { mobileStorage } from "./platform/storage";
import { mobileTracks } from "./platform/tracks";
import { mobilePickTrackFiles, mobileSaveBackupFile, mobilePickBackupFile } from "./platform/files";
import { mobileDrive } from "./platform/drive";

initPlatform({
  storage: mobileStorage,
  tracks: mobileTracks,
  pickTrackFiles: mobilePickTrackFiles,
  saveBackupFile: mobileSaveBackupFile,
  pickBackupFile: mobilePickBackupFile,
  drive: mobileDrive,
  openExternal: (url) => Browser.open({ url }),
});

CapApp.addListener("backButton", ({ canGoBack }) => {
  if (canGoBack) {
    window.history.back();
  } else {
    CapApp.exitApp();
  }
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppRoot />
  </React.StrictMode>,
);
