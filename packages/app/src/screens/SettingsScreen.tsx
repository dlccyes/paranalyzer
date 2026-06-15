import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getSettings,
  saveSettings,
  addSiteOption,
  renameSiteOption,
  removeSiteOption,
  clearAllData,
} from "../data/db";
import { recalcAll } from "../data/recalc";
import { exportBackup, importBackup } from "../data/backup";
import { connectDrive, disconnectDrive, backupToDrive, restoreFromDrive } from "../data/drive";
import { getPlatform } from "../platform";
import type { Settings } from "../data/model";

export function SettingsScreen() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [recalcProgress, setRecalcProgress] = useState<string | null>(null);
  const [newSiteName, setNewSiteName] = useState("");
  const [editingSiteIdx, setEditingSiteIdx] = useState<number | null>(null);
  const [editSiteValue, setEditSiteValue] = useState("");

  useEffect(() => {
    getSettings().then(setSettings);
  }, []);

  const persist = async (next: Settings) => {
    setSettings(next);
    await saveSettings(next);
  };

  const toast = (msg: string) => {
    setStatus(msg);
    setTimeout(() => setStatus(null), 3000);
  };

  const run = async (fn: () => Promise<void>, success: string) => {
    setBusy(true);
    try { await fn(); if (success) toast(success); }
    catch (err) { toast(err instanceof Error ? err.message : "Error"); }
    finally { setBusy(false); }
  };

  const handleExport = () =>
    run(async () => { await exportBackup(); }, "Backup saved");

  const handleImport = async () => {
    const json = await getPlatform().pickBackupFile();
    if (!json) return;
    const { imported, skipped } = await importBackup(json, "merge");
    toast(`Imported ${imported} flights, skipped ${skipped}`);
  };

  const handleAddSite = async () => {
    const name = newSiteName.trim();
    if (!name || !settings) return;
    const updated = await addSiteOption(name);
    setNewSiteName("");
    setSettings({ ...settings, sites: updated });
  };

  const handleRenameSite = async (oldName: string) => {
    const trimmed = editSiteValue.trim();
    if (!trimmed || !settings) { setEditingSiteIdx(null); return; }
    const updated = await renameSiteOption(oldName, trimmed);
    setEditingSiteIdx(null);
    setSettings({ ...settings, sites: updated });
  };

  const handleRemoveSite = async (name: string) => {
    if (!settings) return;
    if (!confirm(`Remove site "${name}"? It will be cleared from all flights.`)) return;
    const updated = await removeSiteOption(name);
    setSettings({ ...settings, sites: updated });
  };

  const handleClearAll = async () => {
    if (!confirm("Remove ALL flights and reset settings? Google Drive connection will be kept. This cannot be undone.")) return;
    await clearAllData();
    const fresh = await getSettings();
    setSettings(fresh);
    toast("All data removed");
  };

  if (!settings) return <div className="screen"><div className="loading">Loading…</div></div>;

  const driveConnected = settings.drive?.connected ?? false;
  const apkUrl = getPlatform().apkUrl;

  return (
    <div className="screen">
      <header className="app-header">
        <button className="btn btn-sm btn-ghost" onClick={() => navigate(-1)}>← Back</button>
        <span className="app-title">Settings</span>
      </header>

      <div className="settings-body">
        {status && <div className="status-toast">{status}</div>}

        <section className="settings-section">
          <h3>Units</h3>
          <div className="unit-toggle">
            {(["metric", "imperial"] as const).map((sys) => (
              <button
                key={sys}
                className={settings.units === sys ? "active" : ""}
                onClick={() => persist({ ...settings, units: sys })}
              >
                {sys === "metric" ? "Metric" : "Imperial"}
              </button>
            ))}
          </div>
        </section>

        <section className="settings-section">
          <h3>Date format</h3>
          <div className="unit-toggle">
            <button
              className={settings.dateFormat === "dmy" ? "active" : ""}
              onClick={() => persist({ ...settings, dateFormat: "dmy" })}
            >
              DD.MM.YYYY
            </button>
            <button
              className={settings.dateFormat === "ymd" ? "active" : ""}
              onClick={() => persist({ ...settings, dateFormat: "ymd" })}
            >
              YYYY-MM-DD
            </button>
          </div>
        </section>

        <section className="settings-section">
          <h3>Thermals</h3>
          <div className="settings-field-row">
            <label htmlFor="thermal-min-turns">Turn threshold</label>
            <div className="settings-input-group">
              <input
                id="thermal-min-turns"
                type="number"
                min={0}
                max={10}
                step={0.5}
                value={settings.thermalMinTurns}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (!Number.isFinite(n)) return;
                  persist({ ...settings, thermalMinTurns: Math.min(10, Math.max(0, n)) });
                }}
              />
              <span className="settings-input-unit">turns</span>
            </div>
          </div>
          <p className="settings-note">
            A climbing circle must complete at least this many full turns to count as a thermal.
            Lower values catch brief climbs; higher values keep only well-formed thermals.
            Recalculate flights below to apply to existing flights.
          </p>
        </section>

        <section className="settings-section">
          <h3>Ridge soaring</h3>
          <div className="settings-field-row">
            <label htmlFor="ridge-bridge-gap">Bridge gap</label>
            <div className="settings-input-group">
              <input
                id="ridge-bridge-gap"
                type="number"
                min={0}
                max={120}
                step={1}
                value={settings.ridgeBridgeGapSec}
                onChange={(e) => {
                  const n = Math.round(Number(e.target.value));
                  if (!Number.isFinite(n)) return;
                  persist({ ...settings, ridgeBridgeGapSec: Math.min(120, Math.max(0, n)) });
                }}
              />
              <span className="settings-input-unit">s</span>
            </div>
          </div>
          <p className="settings-note">
            Consecutive ridge-soaring runs separated by a shorter gap are merged into one.
            Larger values join runs split by brief turns; smaller values keep them apart.
            Recalculate flights below to apply to existing flights.
          </p>
        </section>

        <section className="settings-section">
          <h3>Sites</h3>
          <div className="sites-list">
            {settings.sites.length === 0 && (
              <p className="settings-note">No sites yet — add one below or set it on a flight.</p>
            )}
            {settings.sites.map((s, i) => (
              <div key={s} className="site-list-row">
                {editingSiteIdx === i ? (
                  <input
                    className="site-edit-input"
                    autoFocus
                    value={editSiteValue}
                    onChange={(e) => setEditSiteValue(e.target.value)}
                    onBlur={() => handleRenameSite(s)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleRenameSite(s);
                      if (e.key === "Escape") setEditingSiteIdx(null);
                    }}
                  />
                ) : (
                  <span className="site-list-name">{s}</span>
                )}
                <div className="site-list-actions">
                  <button
                    className="btn btn-xs btn-ghost"
                    onClick={() => { setEditingSiteIdx(i); setEditSiteValue(s); }}
                  >
                    Rename
                  </button>
                  <button
                    className="btn btn-xs btn-ghost"
                    style={{ color: "var(--clr-danger)" }}
                    onClick={() => handleRemoveSite(s)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="site-add-row">
            <input
              className="site-add-input"
              placeholder="New site name…"
              value={newSiteName}
              onChange={(e) => setNewSiteName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleAddSite(); }}
            />
            <button className="btn btn-sm" onClick={handleAddSite} disabled={!newSiteName.trim()}>
              Add
            </button>
          </div>
        </section>

        <section className="settings-section">
          <h3>Local backup</h3>
          <div className="settings-row">
            <button className="btn" onClick={handleExport} disabled={busy}>
              Export backup (JSON)
            </button>
            <button className="btn btn-ghost" onClick={handleImport} disabled={busy}>
              Import backup
            </button>
          </div>
        </section>

        <section className="settings-section">
          <h3>Google Drive</h3>
          {!driveConnected ? (
            <button
              className="btn"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await connectDrive();
                  const s = await getSettings();
                  setSettings(s);
                }, "Connected to Google Drive")
              }
            >
              Connect Google Drive
            </button>
          ) : (
            <div className="settings-row">
              <button
                className="btn"
                disabled={busy}
                onClick={() => run(backupToDrive, "Backup uploaded to Drive")}
              >
                Back up now
              </button>
              <button
                className="btn btn-ghost"
                disabled={busy}
                onClick={async () => {
                  const mode = confirm("Replace all local data with Drive backup?") ? "replace" : "merge";
                  await run(async () => {
                    const { imported, skipped } = await restoreFromDrive(mode);
                    toast(`Restored: ${imported} imported, ${skipped} skipped`);
                  }, "");
                }}
              >
                Import backup from Drive
              </button>
              <button
                className="btn btn-ghost"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await disconnectDrive();
                    const s = await getSettings();
                    setSettings(s);
                  }, "Disconnected")
                }
              >
                Disconnect
              </button>
            </div>
          )}
          {settings.lastBackupAt && (
            <p className="settings-note">
              Last backup: {new Date(settings.lastBackupAt).toLocaleString()}
            </p>
          )}
        </section>

        {apkUrl && (
          <section className="settings-section">
            <h3>Android app</h3>
            <a className="btn" href={apkUrl} download>
              📲 Download Android app
            </a>
            <p className="settings-note">
              Enable "Install unknown apps" for your browser to sideload.
            </p>
          </section>
        )}

        <section className="settings-section">
          <h3>Maintenance</h3>
          <div className="settings-row">
            <button
              className="btn btn-ghost"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setRecalcProgress("Starting…");
                try {
                  const { updated, failed } = await recalcAll((done, total) => {
                    setRecalcProgress(`${done} / ${total}`);
                  });
                  setRecalcProgress(null);
                  toast(`Recalculated ${updated} flight${updated === 1 ? "" : "s"}${failed ? ` (${failed} failed)` : ""}`);
                } catch (err) {
                  setRecalcProgress(null);
                  toast(err instanceof Error ? err.message : "Error");
                } finally {
                  setBusy(false);
                }
              }}
            >
              {recalcProgress ? `Recalculating… ${recalcProgress}` : "Recalculate all flights"}
            </button>
          </div>
          <p className="settings-note">Re-runs analysis on every stored flight. Updates scores, ridge detection, and all derived stats. Keeps your notes, sites, and XContest links.</p>
        </section>

        <section className="settings-section">
          <h3>Data</h3>
          <button
            className="btn btn-ghost"
            style={{ color: "var(--clr-danger)", borderColor: "var(--clr-danger)" }}
            disabled={busy}
            onClick={handleClearAll}
          >
            Remove all data
          </button>
          <p className="settings-note">Clears all flights and resets settings. Keeps Drive connection.</p>
        </section>

        <section className="settings-section">
          <h3>About</h3>
          <p className="settings-note">Paranalyzer · paragliding flight logger</p>
        </section>
      </div>
    </div>
  );
}
