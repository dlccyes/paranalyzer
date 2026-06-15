export interface StorageAdapter {
  readRaw(): Promise<string | null>;
  writeRaw(json: string): Promise<void>;
}

export interface TrackAdapter {
  saveTrack(id: string, ext: string, text: string): Promise<string>;
  readTrack(ref: string): Promise<string>;
  deleteTrack(ref: string): Promise<void>;
  clearAll(): Promise<void>;
}

export interface DriveAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  backupNow(): Promise<void>;
  restore(mode: "merge" | "replace"): Promise<{ imported: number; skipped: number }>;
  maybeAutoBackup(): Promise<void>;
}

export interface PlatformAdapter {
  storage: StorageAdapter;
  tracks: TrackAdapter;
  pickTrackFiles(): Promise<{ name: string; text: string }[]>;
  saveBackupFile(name: string, json: string): Promise<void>;
  pickBackupFile(): Promise<string | null>;
  drive: DriveAdapter;
  openExternal(url: string): Promise<void>;
  apkUrl?: string;
}

let _platform: PlatformAdapter | null = null;

export function initPlatform(adapter: PlatformAdapter): void {
  _platform = adapter;
}

export function getPlatform(): PlatformAdapter {
  if (!_platform) throw new Error("Platform not initialized");
  return _platform;
}
