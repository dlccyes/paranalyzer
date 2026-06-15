import { GoogleAuth } from "@codetrix-studio/capacitor-google-auth";
import { exportBackup, importBackup } from "./backup";
import { getSettings, saveSettings } from "./db";

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
  const data = await res.json() as { files: { id: string }[] };
  return data.files[0]?.id ?? null;
}

async function uploadToDrive(token: string, json: string, existingId: string | null): Promise<void> {
  const boundary = "---ParanalyzerBoundary";
  const metadata = JSON.stringify({ name: BACKUP_FILE_NAME, parents: existingId ? undefined : ["appDataFolder"] });
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${json}\r\n` +
    `--${boundary}--`;

  const url = existingId
    ? `${DRIVE_UPLOAD_URL}/${existingId}?uploadType=multipart`
    : `${DRIVE_UPLOAD_URL}?uploadType=multipart`;
  const method = existingId ? "PATCH" : "POST";

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
  });

  if (!res.ok) throw new Error(`Drive upload failed: ${res.status}`);
}

export async function connectDrive(): Promise<void> {
  await GoogleAuth.initialize();
  await GoogleAuth.signIn();
  const settings = await getSettings();
  settings.drive = { connected: true };
  await saveSettings(settings);
}

export async function disconnectDrive(): Promise<void> {
  await GoogleAuth.signOut();
  const settings = await getSettings();
  settings.drive = { connected: false };
  await saveSettings(settings);
}

export async function backupToDrive(): Promise<void> {
  const token = await getToken();
  const json = await exportBackup();
  const existingId = await findBackupFile(token);
  await uploadToDrive(token, json, existingId);
  const settings = await getSettings();
  settings.lastBackupAt = Date.now();
  await saveSettings(settings);
}

export async function restoreFromDrive(mode: "merge" | "replace"): Promise<{ imported: number; skipped: number }> {
  const token = await getToken();
  const fileId = await findBackupFile(token);
  if (!fileId) throw new Error("No backup found in Google Drive");

  const res = await fetch(`${DRIVE_FILES_URL}/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Drive download failed: ${res.status}`);
  const json = await res.text();
  return importBackup(json, mode);
}

/** Run a backup if Drive is connected and >24h since last backup. */
export async function maybeAutoBackup(): Promise<void> {
  const settings = await getSettings();
  if (!settings.drive?.connected) return;
  const elapsed = Date.now() - (settings.lastBackupAt ?? 0);
  if (elapsed < 24 * 60 * 60 * 1000) return;
  try {
    await backupToDrive();
  } catch {
    // Non-fatal — user can trigger manually
  }
}
