// App root
export { AppRoot } from "./AppRoot";

// Screens
export { FlightsListScreen } from "./screens/FlightsListScreen";
export { FlightDetailScreen } from "./screens/FlightDetailScreen";
export { ManualFlightScreen } from "./screens/ManualFlightScreen";
export { SettingsScreen } from "./screens/SettingsScreen";

// Components
export { ErrorBoundary } from "./components/ErrorBoundary";
export { FilterBar } from "./components/FilterBar";
export { FlightsTable } from "./components/FlightsTable";
export { ColumnConfigSheet } from "./components/ColumnConfigSheet";
export { ImportButton } from "./components/ImportButton";
export { NoteEditor } from "./components/NoteEditor";
export { SiteSelect } from "./components/SiteSelect";
export { DuplicateDialog } from "./components/DuplicateDialog";

// Platform
export { initPlatform, getPlatform } from "./platform";
export type {
  StorageAdapter,
  TrackAdapter,
  DriveAdapter,
  DriveProgress,
  PlatformAdapter,
} from "./platform";

// Data — db
export {
  loadDb,
  saveDb,
  listFlights,
  getFlight,
  findFlightByStartTime,
  addFlight,
  updateFlight,
  updateNote,
  updateSite,
  updateXcontestPoints,
  updateXcontestUrl,
  deleteFlight,
  getSettings,
  saveSettings,
  addSiteOption,
  renameSiteOption,
  removeSiteOption,
  clearAllData,
} from "./data/db";

// Data — backup
export { createBackupJson, exportBackup, importBackup } from "./data/backup";
export type { BackupBundle } from "./data/backup";

// Data — drive REST helpers (used by platform adapters)
export {
  BACKUP_FILE_NAME,
  findBackupFile,
  uploadToDrive,
  downloadFromDrive,
} from "./data/drive-rest";

// Data — drive
export {
  connectDrive,
  disconnectDrive,
  backupToDrive,
  restoreFromDrive,
  maybeAutoBackup,
} from "./data/drive";

// Data — filter
export { makeFilterFn, applyFilters } from "./data/filter";

// Data — breakdown
export { siteBreakdown } from "./data/breakdown";
export type { SiteMetric, SiteSegment } from "./data/breakdown";

// Data — manual flight
export { addManualFlight, updateManualFlight } from "./data/manualFlight";
export type { ManualFlightInput, ManualFlightResult } from "./data/manualFlight";

// Data — import
export { importFlights, commitDuplicate } from "./data/importFlight";
export type { ImportResult, DuplicateInfo } from "./data/importFlight";

// Data — recalc
export { recalcAll } from "./data/recalc";
export type { RecalcResult } from "./data/recalc";

// Data — model
export type {
  FieldId,
  FilterFieldType,
  FilterOp,
  FilterRule,
  SortRule,
  ColumnConfig,
  Settings,
  DbDocument,
} from "./data/model";
export {
  FIELD_TYPES,
  FIELD_LABELS,
  ALL_FIELDS,
  DEFAULT_SETTINGS,
  DB_SCHEMA_VERSION,
} from "./data/model";

// Re-export FlightRecord and XcScore from core for convenience
export type { FlightRecord, XcScore } from "@paranalyzer/core";
