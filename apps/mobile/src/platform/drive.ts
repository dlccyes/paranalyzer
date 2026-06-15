import { GoogleAuth } from "@codetrix-studio/capacitor-google-auth";
import type { DriveAdapter, DriveProgress } from "@paranalyzer/app";
import { createBackupJson, importBackup, getSettings, saveSettings } from "@paranalyzer/app";

const BACKUP_FILE_NAME = "paranalyzer-backup.json";
const DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files";

async function getToken(): Promise<string> {
  const auth = await GoogleAuth.refresh();
  return auth.accessToken;
}

async function findBackupFile(token: string): Promise<string | null> {
  const params = new URLSearchParams({
    spaces: "appDataFolder",
    q: `name='${BACKUP_FILE_NAME}'`,
    fields: "files(id)",
  });
  const res = await fetch(`${DRIVE_FILES_URL}?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Drive lookup failed: ${res.status}`);
  const data = await res.json() as { files: { id: string }[] };
  return data.files[0]?.id ?? null;
}

async function uploadToDrive(token: string, json: string, existingId: string | null): Promise<void> {
  const boundary = "---ParanalyzerBoundary";
  const metadata = JSON.stringify({
    name: BACKUP_FILE_NAME,
    parents: existingId ? undefined : ["appDataFolder"],
  });
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${json}\r\n` +
    `--${boundary}--`;

  const url = existingId
    ? `${DRIVE_UPLOAD_URL}/${existingId}?uploadType=multipart`
    : `${DRIVE_UPLOAD_URL}?uploadType=multipart`;

  const res = await fetch(url, {
    method: existingId ? "PATCH" : "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  if (!res.ok) throw new Error(`Drive upload failed: ${res.status}`);
}

export const mobileDrive: DriveAdapter = {
  connect: async () => {
    // Task L fix: GoogleAuth.initialize() loads the serverClientId from capacitor.config.ts
    await GoogleAuth.initialize();
    await GoogleAuth.signIn();
    const settings = await getSettings();
    settings.drive = { connected: true };
    await saveSettings(settings);
  },

  disconnect: async () => {
    await GoogleAuth.signOut();
    const settings = await getSettings();
    settings.drive = { connected: false };
    await saveSettings(settings);
  },

  backupNow: async (onProgress?: (p: DriveProgress) => void) => {
    onProgress?.({ stage: "preparing" });
    const token = await getToken();
    const json = await createBackupJson((done, total) =>
      onProgress?.({ stage: "importing", done, total }),
    );
    onProgress?.({ stage: "uploading" });
    const existingId = await findBackupFile(token);
    await uploadToDrive(token, json, existingId);
    const settings = await getSettings();
    settings.lastBackupAt = Date.now();
    await saveSettings(settings);
  },

  restore: async (mode, onProgress?: (p: DriveProgress) => void) => {
    onProgress?.({ stage: "downloading" });
    const token = await getToken();
    const fileId = await findBackupFile(token);
    if (!fileId) throw new Error("No backup found in Google Drive");
    const res = await fetch(`${DRIVE_FILES_URL}/${fileId}?alt=media`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Drive download failed: ${res.status}`);
    const json = await res.text();
    return importBackup(json, mode, (done, total) =>
      onProgress?.({ stage: "importing", done, total }),
    );
  },

  maybeAutoBackup: async () => {
    const settings = await getSettings();
    if (!settings.drive?.connected) return;
    const elapsed = Date.now() - (settings.lastBackupAt ?? 0);
    if (elapsed < 24 * 60 * 60 * 1000) return;
    try {
      await mobileDrive.backupNow();
    } catch {
      // Non-fatal
    }
  },
};
