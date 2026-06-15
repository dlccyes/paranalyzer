import { getPlatform, type DriveProgress } from "../platform";

export type { DriveProgress };

export function connectDrive(): Promise<void> {
  return getPlatform().drive.connect();
}

export function disconnectDrive(): Promise<void> {
  return getPlatform().drive.disconnect();
}

export function backupToDrive(onProgress?: (p: DriveProgress) => void): Promise<void> {
  return getPlatform().drive.backupNow(onProgress);
}

export function restoreFromDrive(
  mode: "merge" | "replace",
  onProgress?: (p: DriveProgress) => void,
): Promise<{ imported: number; skipped: number }> {
  return getPlatform().drive.restore(mode, onProgress);
}

export function maybeAutoBackup(): Promise<void> {
  return getPlatform().drive.maybeAutoBackup();
}
