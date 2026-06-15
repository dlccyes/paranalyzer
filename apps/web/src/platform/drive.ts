import type { DriveAdapter, DriveProgress } from "@paranalyzer/app";
import { createBackupJson, importBackup, getSettings, saveSettings } from "@paranalyzer/app";

const BACKUP_FILE_NAME = "paranalyzer-backup.json";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.appdata";
const DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files";
const GOOGLE_CLIENT_ID =
  (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) ??
  "793792702856-2pkgc4a54n4or7ijcb1vm3rld3un35r5.apps.googleusercontent.com";
const GIS_SCRIPT_URL = "https://accounts.google.com/gsi/client";
const TOKEN_KEY = "paranalyzer.googleDriveToken";

interface StoredToken {
  accessToken: string;
  expiresAt: number;
}

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
}

type TokenClient = {
  requestAccessToken: (overrideConfig?: { prompt?: string }) => void;
  callback?: (response: TokenResponse) => void;
};

type GoogleIdentity = {
  accounts: {
    oauth2: {
      initTokenClient: (config: {
        client_id: string;
        scope: string;
        callback: (response: TokenResponse) => void;
      }) => TokenClient;
    };
  };
};

declare global {
  interface Window {
    google?: GoogleIdentity;
  }
}

let tokenClient: TokenClient | null = null;
let scriptPromise: Promise<void> | null = null;

function readStoredToken(): StoredToken | null {
  const raw = sessionStorage.getItem(TOKEN_KEY);
  if (!raw) return null;
  try {
    const token = JSON.parse(raw) as StoredToken;
    return token.expiresAt > Date.now() + 60_000 ? token : null;
  } catch {
    return null;
  }
}

function storeToken(accessToken: string, expiresIn = 3600): void {
  sessionStorage.setItem(TOKEN_KEY, JSON.stringify({
    accessToken,
    expiresAt: Date.now() + expiresIn * 1000,
  }));
}

function loadGoogleIdentity(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SCRIPT_URL}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Google sign-in script failed to load")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = GIS_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google sign-in script failed to load"));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

async function getToken(prompt = "consent"): Promise<string> {
  if (!GOOGLE_CLIENT_ID) {
    throw new Error("Google Drive is not configured. Set VITE_GOOGLE_CLIENT_ID to a Web OAuth client ID.");
  }
  const stored = readStoredToken();
  if (stored) return stored.accessToken;

  await loadGoogleIdentity();
  if (!window.google) throw new Error("Google sign-in is not available");

  return new Promise((resolve, reject) => {
    tokenClient = tokenClient ?? window.google!.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: DRIVE_SCOPE,
      callback: () => undefined,
    });
    tokenClient.callback = (response) => {
      if (response.error || !response.access_token) {
        reject(new Error(response.error || "Google Drive authorization failed"));
        return;
      }
      storeToken(response.access_token, response.expires_in);
      resolve(response.access_token);
    };
    tokenClient.requestAccessToken({ prompt });
  });
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

export const webDrive: DriveAdapter = {
  connect: async () => {
    await getToken("consent");
    const settings = await getSettings();
    settings.drive = { connected: true };
    await saveSettings(settings);
  },

  disconnect: async () => {
    sessionStorage.removeItem(TOKEN_KEY);
    const settings = await getSettings();
    settings.drive = { connected: false };
    await saveSettings(settings);
  },

  backupNow: async (onProgress?: (p: DriveProgress) => void) => {
    onProgress?.({ stage: "authorizing" });
    const token = await getToken();
    onProgress?.({ stage: "preparing" });
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
    onProgress?.({ stage: "authorizing" });
    const token = await getToken();
    onProgress?.({ stage: "downloading" });
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
    if (!readStoredToken()) return;
    try {
      await webDrive.backupNow();
    } catch {
      // Non-fatal
    }
  },
};
