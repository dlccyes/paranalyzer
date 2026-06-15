import { getPlatform } from "../platform";

export function connectDrive(): Promise<void> {
  return getPlatform().drive.connect();
}

export function disconnectDrive(): Promise<void> {
  return getPlatform().drive.disconnect();
}

export function backupToDrive(): Promise<void> {
  return getPlatform().drive.backupNow();
}

export function restoreFromDrive(mode: "merge" | "replace"): Promise<{ imported: number; skipped: number }> {
  return getPlatform().drive.restore(mode);
}

export function maybeAutoBackup(): Promise<void> {
  return getPlatform().drive.maybeAutoBackup();
}
