import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { Flight } from "@paranalyzer/core";
import { parseTrack } from "@paranalyzer/core";
import { AnalysisView, TimeBreakdownChart } from "@paranalyzer/ui";
import {
  getFlight,
  updateNote,
  updateSite,
  updateXcontestUrl,
  deleteFlight,
  getSettings,
} from "../data/db";
import { readTrack, deleteTrack } from "../data/trackStore";
import { SiteSelect } from "../components/SiteSelect";
import { getPlatform } from "../platform";
import { analyzeWithSettings } from "../data/analyze";
import { DEFAULT_SETTINGS, type FlightRecord } from "../data/model";
import type { UnitSystem } from "@paranalyzer/core";

export function FlightDetailScreen() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [rec, setRec] = useState<FlightRecord | null>(null);
  const [flight, setFlight] = useState<Flight | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [units, setUnits] = useState<UnitSystem>("metric");
  const [dateFormat, setDateFormat] = useState<"dmy" | "ymd">("dmy");
  const [analysisSettings, setAnalysisSettings] = useState({
    thermalMinTurns: DEFAULT_SETTINGS.thermalMinTurns,
    thermalBridgeGapSec: DEFAULT_SETTINGS.thermalBridgeGapSec,
    ridgeBridgeGapSec: DEFAULT_SETTINGS.ridgeBridgeGapSec,
  });
  const [sites, setSites] = useState<string[]>([]);
  const [urlInput, setUrlInput] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const cfg = await getSettings();
        if (cancelled) return;
        setUnits(cfg.units);
        setDateFormat(cfg.dateFormat ?? "dmy");
        setAnalysisSettings({
          thermalMinTurns: cfg.thermalMinTurns,
          thermalBridgeGapSec: cfg.thermalBridgeGapSec,
          ridgeBridgeGapSec: cfg.ridgeBridgeGapSec,
        });
        setSites(cfg.sites);
        const record = getFlight(id);
        if (!record) { setNotFound(true); return; }
        setRec(record);
        setUrlInput(record.xcontestUrl ?? "");
        setNoteDraft(record.note ?? "");
        const text = await readTrack(record.trackRef);
        if (cancelled) return;
        const parsed = parseTrack(record.fileName ?? `flight.${record.source}`, text);
        const analysed = await analyzeWithSettings(parsed, cfg);
        if (!cancelled) setFlight(analysed);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load flight");
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  const handleSiteChange = async (site: string, updatedSites: string[]) => {
    if (!rec) return;
    await updateSite(rec.id, site);
    setRec((r) => r ? { ...r, site } : r);
    setSites(updatedSites);
  };

  const handleUrlBlur = async () => {
    if (!rec) return;
    const trimmed = urlInput.trim();
    const url = trimmed === "" ? undefined : trimmed;
    if (url && !url.startsWith("http")) return;
    await updateXcontestUrl(rec.id, url);
    setRec((r) => r ? { ...r, xcontestUrl: url } : r);
  };

  const handleDelete = async () => {
    if (!rec) return;
    if (!confirm("Delete this flight permanently?")) return;
    await deleteTrack(rec.trackRef);
    await deleteFlight(rec.id);
    navigate("/", { replace: true });
  };

  if (notFound) {
    return (
      <div className="screen">
        <header className="app-header">
          <button className="btn btn-sm btn-ghost" onClick={() => navigate(-1)}>← Back</button>
          <span className="app-title">Flight not found</span>
        </header>
      </div>
    );
  }

  const summarySlot = rec ? (
    <>
      <div className="detail-fields">
        <div className="detail-field">
          <label className="detail-field-label">Site</label>
          <SiteSelect
            value={rec.site ?? ""}
            sites={sites}
            onSiteChange={handleSiteChange}
          />
        </div>
        <div className="detail-field">
          <label className="detail-field-label">XContest link</label>
          <div className="xc-url-row">
            <input
              className="xpts-input"
              type="url"
              inputMode="url"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onBlur={handleUrlBlur}
              placeholder="https://…"
            />
            {rec.xcontestUrl && (
              <button
                className="btn btn-sm btn-ghost xc-open-btn"
                onClick={() => getPlatform().openExternal(rec.xcontestUrl!)}
                title="Open XContest flight"
              >
                ↗
              </button>
            )}
          </div>
        </div>
      </div>
      {flight && (
        <details className="dashboard-panel summary-dashboard" open>
          <summary>
            <div className="panel-title">Dashboard</div>
          </summary>
          <TimeBreakdownChart
            breakdown={{
              airtime: flight.stats.airtime,
              thermal: flight.stats.timeInThermal,
              ridge: flight.stats.timeInRidge,
              glide: flight.stats.timeInGlide,
            }}
          />
        </details>
      )}
      <div className="note-editor">
        <div className="panel-title">Note</div>
        <div className="note-body">
          <textarea
            className="note-textarea"
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            placeholder="Add a note about this flight…"
            rows={3}
          />
          {noteDraft !== (rec.note ?? "") && (
            <button
              className="btn btn-sm"
              disabled={noteSaving}
              onClick={async () => {
                setNoteSaving(true);
                try { await updateNote(rec.id, noteDraft); } finally { setNoteSaving(false); }
              }}
            >
              {noteSaving ? "Saving…" : "Save"}
            </button>
          )}
        </div>
      </div>
    </>
  ) : null;

  return (
    <div className="screen">
      <header className="app-header">
        <button className="btn btn-sm btn-ghost" onClick={() => navigate(-1)}>← Back</button>
        <span className="app-title">{rec?.fileName ?? "Flight"}</span>
        <button className="btn btn-sm btn-danger" onClick={handleDelete}>Delete</button>
      </header>

      <div className="detail-body">
        {error && <div className="error-banner">{error}</div>}
        {!flight && !error && <div className="loading">Analyzing…</div>}
        {flight && rec && (
          <AnalysisView
            flight={flight}
            units={units}
            dateFormat={dateFormat}
            thermalMinTurns={analysisSettings.thermalMinTurns}
            thermalBridgeGapSec={analysisSettings.thermalBridgeGapSec}
            ridgeBridgeGapSec={analysisSettings.ridgeBridgeGapSec}
            onUnitsChange={setUnits}
            summarySlot={summarySlot}
          />
        )}
      </div>
    </div>
  );
}
