import { useState } from "react";
import { addSiteOption, renameSiteOption, removeSiteOption } from "../data/db";

interface Props {
  value: string;
  sites: string[];
  onSiteChange: (site: string, updatedSites: string[]) => void;
}

export function SiteSelect({ value, sites, onSiteChange }: Props) {
  const [showManage, setShowManage] = useState(false);
  const [newSiteName, setNewSiteName] = useState("");
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");

  const handleSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onSiteChange(e.target.value, sites);
  };

  const handleAdd = async () => {
    const name = newSiteName.trim();
    if (!name) return;
    const updated = await addSiteOption(name);
    setNewSiteName("");
    // Auto-select the newly added site
    onSiteChange(name, updated);
  };

  const handleRename = async (oldName: string) => {
    const trimmed = editValue.trim();
    if (!trimmed || trimmed === oldName) { setEditingIdx(null); return; }
    const updated = await renameSiteOption(oldName, trimmed);
    setEditingIdx(null);
    // If current flight had the old name, update it
    if (value === oldName) onSiteChange(trimmed, updated);
    else onSiteChange(value, updated);
  };

  const handleRemove = async (name: string) => {
    if (!confirm(`Remove site "${name}"? It will be cleared from all flights.`)) return;
    const updated = await removeSiteOption(name);
    if (value === name) onSiteChange("", updated);
    else onSiteChange(value, updated);
  };

  // Include current value as an option even if not in the managed list (legacy auto-filled)
  const options = value && !sites.includes(value) ? [...sites, value].sort() : sites;

  return (
    <div className="site-select-wrap">
      <div className="site-select-row">
        <select className="site-select" value={value} onChange={handleSelect}>
          <option value="">— No site —</option>
          {options.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <button className="btn btn-sm btn-ghost" onClick={() => setShowManage(true)}>
          Manage
        </button>
      </div>

      {showManage && (
        <div className="sheet-backdrop" onClick={() => setShowManage(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-header">
              <span className="sheet-title">Sites</span>
              <button className="btn btn-sm btn-ghost" onClick={() => setShowManage(false)}>Done</button>
            </div>
            <div className="sheet-scroll">
              {sites.map((s, i) => (
                <div key={s} className="col-row">
                  {editingIdx === i ? (
                    <input
                      className="site-edit-input"
                      autoFocus
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={() => handleRename(s)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleRename(s); if (e.key === "Escape") setEditingIdx(null); }}
                    />
                  ) : (
                    <span className="col-check" style={{ flex: 1 }}>{s}</span>
                  )}
                  <div className="col-reorder">
                    <button
                      className="btn btn-xs btn-ghost"
                      onClick={() => { setEditingIdx(i); setEditValue(s); }}
                    >
                      ✏️
                    </button>
                    <button
                      className="btn btn-xs btn-ghost"
                      style={{ color: "var(--clr-danger)" }}
                      onClick={() => handleRemove(s)}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
              <div className="site-add-row">
                <input
                  className="site-add-input"
                  placeholder="New site name…"
                  value={newSiteName}
                  onChange={(e) => setNewSiteName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
                />
                <button className="btn btn-sm" onClick={handleAdd} disabled={!newSiteName.trim()}>
                  Add
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
