import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getSettings, saveSettings, addSiteOption, renameSiteOption, removeSiteOption } from "../data/db";
import { exportBackup, importBackup } from "../data/backup";
import { connectDrive, disconnectDrive, backupToDrive, restoreFromDrive } from "../data/drive";
import type { Settings } from "../data/model";

export function SettingsScreen() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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
    try { await fn(); toast(success); }
    catch (err) { toast(err instanceof Error ? err.message : "Error"); }
    finally { setBusy(false); }
  };

  const handleExport = async () =>
    run(async () => { await exportBackup(); }, "Backup downloaded");

  const handleImport = async () => {
    const file = await new Promise<File | null>((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "application/json,.json,text/*";
      input.style.display = "none";
      document.body.appendChild(input);
      input.addEventListener("change", () => {
        const picked = input.files?.[0] ?? null;
        input.remove();
        resolve(picked);
      }, { once: true });
      input.click();
    });
    if (!file) return;
    const json = await file.text();
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

  if (!settings) return <div className="screen"><div className="loading">Loading…</div></div>;

  const driveConnected = settings.drive?.connected ?? false;

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
                    onKeyDown={(e) => { if (e.key === "Enter") handleRenameSite(s); if (e.key === "Escape") setEditingSiteIdx(null); }}
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
              onClick={() => run(async () => { await connectDrive(); const s = await getSettings(); setSettings(s); }, "Connected to Google Drive")}
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
                onClick={() => run(async () => { await disconnectDrive(); const s = await getSettings(); setSettings(s); }, "Disconnected")}
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

        <section className="settings-section">
          <h3>About</h3>
          <p className="settings-note">Paranalyzer · paragliding flight logger</p>
        </section>
      </div>
    </div>
  );
}
