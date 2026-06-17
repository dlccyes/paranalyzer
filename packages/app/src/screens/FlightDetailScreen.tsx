import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { Flight } from "@paranalyzer/core";
import { parseTrack, formatDuration, formatDate, formatClock, makeFormatter } from "@paranalyzer/core";
import { AnalysisView, TimeBreakdownChart } from "@paranalyzer/ui";
import {
  getFlight,
  updateNote,
  updateSite,
  updateXcontestUrl,
  deleteFlight,
  getSettings,
  saveSettings,
} from "../data/db";
import { getPlatform } from "../platform";
import { readTrack, deleteTrack } from "../data/trackStore";
import { SiteSelect } from "../components/SiteSelect";
import { analyzeWithSettings } from "../data/analyze";
import { DEFAULT_SETTINGS, type FlightRecord, type Settings } from "../data/model";
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
  const [mapBase, setMapBase] = useState<Settings["mapBase"]>("street");
  const [fullSettings, setFullSettings] = useState<Settings | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const cfg = await getSettings();
        if (cancelled) return;
        setFullSettings(cfg);
        setUnits(cfg.units);
        setDateFormat(cfg.dateFormat ?? "dmy");
        setAnalysisSettings({
          thermalMinTurns: cfg.thermalMinTurns,
          thermalBridgeGapSec: cfg.thermalBridgeGapSec,
          ridgeBridgeGapSec: cfg.ridgeBridgeGapSec,
        });
        setSites(cfg.sites);
        setMapBase(cfg.mapBase ?? "street");
        const record = getFlight(id);
        if (!record) { setNotFound(true); return; }
        setRec(record);
        setUrlInput(record.xcontestUrl ?? "");
        setNoteDraft(record.note ?? "");
        if (record.manual) return;
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

  const handleMapBaseChange = async (base: Settings["mapBase"]) => {
    setMapBase(base);
    if (fullSettings) await saveSettings({ ...fullSettings, mapBase: base });
  };

  const handleDelete = async () => {
    if (!rec) return;
    if (!confirm("Delete this flight permanently?")) return;
    if (!rec.manual) await deleteTrack(rec.trackRef);
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

  // Manual flight title: "Manual · DD.MM.YYYY"
  const manualTitle = rec?.manual && rec.startTime
    ? `Manual · ${formatDate(rec.startTime, rec.tzOffsetMinutes ?? 0, dateFormat)}`
    : undefined;

  return (
    <div className="screen">
      <header className="app-header">
        <button className="btn btn-sm btn-ghost" onClick={() => navigate(-1)}>← Back</button>
        <span className="app-title">{manualTitle ?? rec?.fileName ?? "Flight"}</span>
        <div className="header-actions">
          {rec?.manual && (
            <button className="btn btn-sm btn-ghost" onClick={() => navigate(`/flight/${rec.id}/edit`)}>Edit</button>
          )}
          <button className="btn btn-sm btn-danger" onClick={handleDelete}>Delete</button>
        </div>
      </header>

      <div className="detail-body">
        {error && <div className="error-banner">{error}</div>}
        {rec?.manual ? (
          <ManualDetailView rec={rec} units={units} dateFormat={dateFormat} sites={sites} onSiteChange={handleSiteChange} urlInput={urlInput} onUrlChange={setUrlInput} onUrlBlur={handleUrlBlur} noteDraft={noteDraft} onNoteChange={setNoteDraft} onNoteSave={async () => { if (rec) await updateNote(rec.id, noteDraft); }} />
        ) : (
          <>
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
                mapBase={mapBase}
                onMapBaseChange={handleMapBaseChange}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

interface ManualDetailProps {
  rec: FlightRecord;
  units: UnitSystem;
  dateFormat: "dmy" | "ymd";
  sites: string[];
  onSiteChange: (site: string, sites: string[]) => void;
  urlInput: string;
  onUrlChange: (v: string) => void;
  onUrlBlur: () => void;
  noteDraft: string;
  onNoteChange: (v: string) => void;
  onNoteSave: () => Promise<void>;
}

function ManualDetailView({ rec, units, dateFormat, sites, onSiteChange, urlInput, onUrlChange, onUrlBlur, noteDraft, onNoteChange, onNoteSave }: ManualDetailProps) {
  const fmt = makeFormatter(units);
  const [noteSaving, setNoteSaving] = useState(false);

  const stat = (label: string, value: string) => (
    <div className="manual-stat">
      <span className="manual-stat-label">{label}</span>
      <span className="manual-stat-value">{value || "—"}</span>
    </div>
  );

  const dateStr = rec.startTime
    ? `${formatDate(rec.startTime, rec.tzOffsetMinutes ?? 0, dateFormat)} ${formatClock(rec.startTime, rec.tzOffsetMinutes ?? 0)}`
    : "—";

  return (
    <div className="manual-detail-body">
      <div className="detail-fields">
        <div className="detail-field">
          <label className="detail-field-label">Site</label>
          <SiteSelect value={rec.site ?? ""} sites={sites} onSiteChange={onSiteChange} />
        </div>
        <div className="detail-field">
          <label className="detail-field-label">XContest link</label>
          <div className="xc-url-row">
            <input className="xpts-input" type="url" inputMode="url" value={urlInput} onChange={(e) => onUrlChange(e.target.value)} onBlur={onUrlBlur} placeholder="https://…" />
            {rec.xcontestUrl && (
              <button className="btn btn-sm btn-ghost xc-open-btn" onClick={() => getPlatform().openExternal(rec.xcontestUrl!)}>↗</button>
            )}
          </div>
        </div>
      </div>

      <details className="dashboard-panel summary-dashboard" open>
        <summary><div className="panel-title">Dashboard</div></summary>
        <TimeBreakdownChart breakdown={{ airtime: rec.airtime, thermal: rec.timeInThermal, glide: rec.timeInGlide ?? 0, ridge: rec.timeInRidge }} />
      </details>

      <div className="manual-stats-grid">
        {stat("Date / time", dateStr)}
        {stat("Glider", rec.glider ?? "")}
        {stat("Pilot", rec.pilot ?? "")}
        {stat("Airtime", formatDuration(rec.airtime, true))}
        {stat("In thermal", formatDuration(rec.timeInThermal))}
        {stat("In glide", formatDuration(rec.timeInGlide ?? 0))}
        {stat("Ridge soaring", formatDuration(rec.timeInRidge))}
        {stat("Max alt", rec.maxAlt ? fmt.altitude(rec.maxAlt) : "")}
        {stat("Alt gain", rec.maxAltGain ? fmt.altitude(rec.maxAltGain) : "")}
        {stat("Max climb", rec.maxClimb ? fmt.vario(rec.maxClimb) : "")}
        {stat("Max sink", rec.maxSink ? fmt.vario(rec.maxSink) : "")}
        {stat("Track length", rec.trackLength ? fmt.distance(rec.trackLength) : "")}
        {stat("Free dist", rec.freeDistance ? fmt.distance(rec.freeDistance) : "")}
        {stat("Avg speed", rec.avgSpeed ? fmt.speed(rec.avgSpeed) : "")}
        {stat("Thermals", rec.thermalCount ? String(rec.thermalCount) : "")}
        {stat("Glides", rec.glideCount ? String(rec.glideCount) : "")}
        {stat("Ridge runs", rec.ridgeCount ? String(rec.ridgeCount) : "")}
        {rec.windSpeed != null && stat("Wind speed", fmt.speed(rec.windSpeed))}
        {rec.xcontestPoints != null && stat("XC points", String(rec.xcontestPoints))}
      </div>

      <div className="note-editor">
        <div className="panel-title">Note</div>
        <div className="note-body">
          <textarea className="note-textarea" value={noteDraft} onChange={(e) => onNoteChange(e.target.value)} placeholder="Add a note about this flight…" rows={3} />
          {noteDraft !== (rec.note ?? "") && (
            <button className="btn btn-sm" disabled={noteSaving} onClick={async () => { setNoteSaving(true); try { await onNoteSave(); } finally { setNoteSaving(false); } }}>
              {noteSaving ? "Saving…" : "Save"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
