import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { parseHhMm, formatHhMm, makeFormatter, type UnitSystem } from "@paranalyzer/core";
import { getSettings, getFlight } from "../data/db";
import { SiteSelect } from "../components/SiteSelect";
import { addManualFlight, updateManualFlight, type ManualFlightInput } from "../data/manualFlight";

const M_TO_FT = 3.280839895;
const M_TO_MI = 1 / 1609.344;
const MS_TO_KMH = 3.6;
const MS_TO_MPH = 2.236936292;
const MS_TO_FPM = 196.8503937;

function toDisplay(si: number, type: "alt" | "dist" | "speed" | "vario", units: UnitSystem): string {
  if (!Number.isFinite(si) || si === 0) return "";
  if (type === "alt") return String(Math.round(units === "metric" ? si : si * M_TO_FT));
  if (type === "dist") return (units === "metric" ? si * 0.001 : si * M_TO_MI).toFixed(2);
  if (type === "speed") return (units === "metric" ? si * MS_TO_KMH : si * MS_TO_MPH).toFixed(1);
  if (type === "vario") return (units === "metric" ? si : si * MS_TO_FPM).toFixed(1);
  return String(si);
}

function fromDisplay(display: string, type: "alt" | "dist" | "speed" | "vario", units: UnitSystem): number {
  const n = parseFloat(display);
  if (!Number.isFinite(n)) return 0;
  if (type === "alt") return units === "metric" ? n : n / M_TO_FT;
  if (type === "dist") return units === "metric" ? n * 1000 : n / M_TO_MI;
  if (type === "speed") return units === "metric" ? n / MS_TO_KMH : n / MS_TO_MPH;
  if (type === "vario") return units === "metric" ? n : n / MS_TO_FPM;
  return n;
}

function localDatetimeToEpoch(local: string, tzOffsetMinutes: number): number {
  // local is "YYYY-MM-DDTHH:MM" in the local time indicated by tzOffsetMinutes
  const d = new Date(local + "Z");
  return d.getTime() - tzOffsetMinutes * 60_000;
}

function epochToLocalDatetime(epochMs: number, tzOffsetMinutes: number): string {
  const localMs = epochMs + tzOffsetMinutes * 60_000;
  const d = new Date(localMs);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

interface FormState {
  datetime: string;
  tzOffset: string;
  site: string;
  glider: string;
  pilot: string;
  airtime: string;
  thermal: string;
  glide: string;
  ridge: string;
  maxAlt: string;
  maxAltGain: string;
  maxClimb: string;
  maxSink: string;
  trackLength: string;
  freeDistance: string;
  avgSpeed: string;
  thermalCount: string;
  glideCount: string;
  ridgeCount: string;
  windSpeed: string;
  windFromDeg: string;
  xcUrl: string;
  xcPoints: string;
  note: string;
}

function emptyForm(): FormState {
  const now = new Date();
  const localIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}T${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const tzOff = -now.getTimezoneOffset();
  return {
    datetime: localIso, tzOffset: String(tzOff),
    site: "", glider: "", pilot: "",
    airtime: "", thermal: "", glide: "", ridge: "",
    maxAlt: "", maxAltGain: "", maxClimb: "", maxSink: "",
    trackLength: "", freeDistance: "", avgSpeed: "",
    thermalCount: "", glideCount: "", ridgeCount: "",
    windSpeed: "", windFromDeg: "", xcUrl: "", xcPoints: "", note: "",
  };
}

export function ManualFlightScreen() {
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const isEdit = Boolean(id);

  const [units, setUnits] = useState<UnitSystem>("metric");
  const [sites, setSites] = useState<string[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fmt = makeFormatter(units);

  useEffect(() => {
    getSettings().then(async (cfg) => {
      setUnits(cfg.units);
      setSites(cfg.sites);
      if (id) {
        const rec = getFlight(id);
        if (rec) {
          const tzOff = rec.tzOffsetMinutes ?? 0;
          setForm({
            datetime: epochToLocalDatetime(rec.startTime, tzOff),
            tzOffset: String(tzOff),
            site: rec.site ?? "",
            glider: rec.glider ?? "",
            pilot: rec.pilot ?? "",
            airtime: formatHhMm(rec.airtime),
            thermal: rec.timeInThermal ? formatHhMm(rec.timeInThermal) : "",
            glide: rec.timeInGlide ? formatHhMm(rec.timeInGlide) : "",
            ridge: rec.timeInRidge ? formatHhMm(rec.timeInRidge) : "",
            maxAlt: toDisplay(rec.maxAlt, "alt", cfg.units),
            maxAltGain: toDisplay(rec.maxAltGain, "alt", cfg.units),
            maxClimb: toDisplay(rec.maxClimb, "vario", cfg.units),
            maxSink: toDisplay(rec.maxSink, "vario", cfg.units),
            trackLength: toDisplay(rec.trackLength, "dist", cfg.units),
            freeDistance: toDisplay(rec.freeDistance, "dist", cfg.units),
            avgSpeed: toDisplay(rec.avgSpeed, "speed", cfg.units),
            thermalCount: rec.thermalCount ? String(rec.thermalCount) : "",
            glideCount: rec.glideCount ? String(rec.glideCount) : "",
            ridgeCount: rec.ridgeCount ? String(rec.ridgeCount) : "",
            windSpeed: rec.windSpeed != null ? toDisplay(rec.windSpeed, "speed", cfg.units) : "",
            windFromDeg: rec.windFromDeg != null ? String(Math.round(rec.windFromDeg)) : "",
            xcUrl: rec.xcontestUrl ?? "",
            xcPoints: rec.xcontestPoints != null ? String(rec.xcontestPoints) : "",
            note: rec.note ?? "",
          });
        }
      }
    });
  }, [id]);

  const set = (key: keyof FormState, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const buildInput = (): ManualFlightInput => {
    const tzOff = parseInt(form.tzOffset) || 0;
    return {
      startTime: localDatetimeToEpoch(form.datetime, tzOff),
      tzOffsetMinutes: tzOff,
      site: form.site || undefined,
      glider: form.glider || undefined,
      pilot: form.pilot || undefined,
      airtime: parseHhMm(form.airtime),
      timeInThermal: form.thermal ? parseHhMm(form.thermal) : undefined,
      timeInGlide: form.glide ? parseHhMm(form.glide) : undefined,
      timeInRidge: form.ridge ? parseHhMm(form.ridge) : undefined,
      maxAlt: fromDisplay(form.maxAlt, "alt", units) || undefined,
      maxAltGain: fromDisplay(form.maxAltGain, "alt", units) || undefined,
      maxClimb: fromDisplay(form.maxClimb, "vario", units) || undefined,
      maxSink: fromDisplay(form.maxSink, "vario", units) || undefined,
      trackLength: fromDisplay(form.trackLength, "dist", units) || undefined,
      freeDistance: fromDisplay(form.freeDistance, "dist", units) || undefined,
      avgSpeed: fromDisplay(form.avgSpeed, "speed", units) || undefined,
      thermalCount: parseInt(form.thermalCount) || undefined,
      glideCount: parseInt(form.glideCount) || undefined,
      ridgeCount: parseInt(form.ridgeCount) || undefined,
      windSpeed: fromDisplay(form.windSpeed, "speed", units) || undefined,
      windFromDeg: parseFloat(form.windFromDeg) || undefined,
      xcontestUrl: form.xcUrl || undefined,
      xcontestPoints: parseFloat(form.xcPoints) || undefined,
      note: form.note,
    };
  };

  const canSave = form.datetime.length >= 10 && parseHhMm(form.airtime) > 0;

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const input = buildInput();
      if (isEdit && id) {
        await updateManualFlight(id, input);
        navigate(`/flight/${id}`);
      } else {
        const result = await addManualFlight(input);
        if (result.duplicate) {
          setError("A flight with this start time already exists.");
        } else {
          navigate(`/flight/${result.id}`);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const label = (text: string, hint?: string) => (
    <label className="manual-field-label">
      {text}
      {hint && <span className="manual-field-unit">{hint}</span>}
    </label>
  );

  return (
    <div className="screen">
      <header className="app-header">
        <button className="btn btn-sm btn-ghost" onClick={() => navigate(-1)}>← Back</button>
        <span className="app-title">{isEdit ? "Edit flight" : "Add flight"}</span>
        <button
          className="btn btn-sm btn-primary"
          disabled={!canSave || saving}
          onClick={handleSave}
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </header>

      <div className="manual-body">
        {error && <div className="error-banner">{error}</div>}

        <section className="manual-section">
          <h3>Identity</h3>
          <div className="manual-field">
            {label("Date & time")}
            <input
              type="datetime-local"
              className="manual-input"
              value={form.datetime}
              onChange={(e) => set("datetime", e.target.value)}
            />
          </div>
          <div className="manual-field">
            {label("Timezone offset", "minutes from UTC")}
            <input
              type="number"
              className="manual-input"
              value={form.tzOffset}
              placeholder="0"
              onChange={(e) => set("tzOffset", e.target.value)}
            />
          </div>
          <div className="manual-field">
            {label("Site")}
            <SiteSelect
              value={form.site}
              sites={sites}
              onSiteChange={(site, updated) => { set("site", site); setSites(updated); }}
            />
          </div>
          <div className="manual-field">
            {label("Glider")}
            <input
              type="text"
              className="manual-input"
              value={form.glider}
              placeholder="e.g. PHI Symphonia"
              onChange={(e) => set("glider", e.target.value)}
            />
          </div>
          <div className="manual-field">
            {label("Pilot")}
            <input
              type="text"
              className="manual-input"
              value={form.pilot}
              placeholder="Name"
              onChange={(e) => set("pilot", e.target.value)}
            />
          </div>
        </section>

        <section className="manual-section">
          <h3>Time <span className="manual-section-hint">H:MM</span></h3>
          <div className="manual-field">
            {label("Airtime", "required")}
            <input
              type="text"
              className="manual-input"
              value={form.airtime}
              placeholder="1:30"
              onChange={(e) => set("airtime", e.target.value)}
            />
          </div>
          <div className="manual-field">
            {label("In thermal")}
            <input type="text" className="manual-input" value={form.thermal} placeholder="0:00" onChange={(e) => set("thermal", e.target.value)} />
          </div>
          <div className="manual-field">
            {label("In glide")}
            <input type="text" className="manual-input" value={form.glide} placeholder="0:00" onChange={(e) => set("glide", e.target.value)} />
          </div>
          <div className="manual-field">
            {label("Ridge soaring")}
            <input type="text" className="manual-input" value={form.ridge} placeholder="0:00" onChange={(e) => set("ridge", e.target.value)} />
          </div>
        </section>

        <section className="manual-section">
          <h3>Altitude <span className="manual-section-hint">{fmt.labels.altitude}</span></h3>
          <div className="manual-field">
            {label("Max alt", fmt.labels.altitude)}
            <input type="number" className="manual-input" value={form.maxAlt} placeholder="0" onChange={(e) => set("maxAlt", e.target.value)} />
          </div>
          <div className="manual-field">
            {label("Alt gain", fmt.labels.altitude)}
            <input type="number" className="manual-input" value={form.maxAltGain} placeholder="0" onChange={(e) => set("maxAltGain", e.target.value)} />
          </div>
          <div className="manual-field">
            {label("Max climb", fmt.labels.vario)}
            <input type="number" className="manual-input" value={form.maxClimb} placeholder="0" onChange={(e) => set("maxClimb", e.target.value)} />
          </div>
          <div className="manual-field">
            {label("Max sink", fmt.labels.vario)}
            <input type="number" className="manual-input" value={form.maxSink} placeholder="0" onChange={(e) => set("maxSink", e.target.value)} />
          </div>
        </section>

        <section className="manual-section">
          <h3>Distance & speed</h3>
          <div className="manual-field">
            {label("Track length", fmt.labels.distance)}
            <input type="number" className="manual-input" value={form.trackLength} placeholder="0" onChange={(e) => set("trackLength", e.target.value)} />
          </div>
          <div className="manual-field">
            {label("Free dist", fmt.labels.distance)}
            <input type="number" className="manual-input" value={form.freeDistance} placeholder="0" onChange={(e) => set("freeDistance", e.target.value)} />
          </div>
          <div className="manual-field">
            {label("Avg speed", fmt.labels.speed)}
            <input type="number" className="manual-input" value={form.avgSpeed} placeholder="0" onChange={(e) => set("avgSpeed", e.target.value)} />
          </div>
        </section>

        <section className="manual-section">
          <h3>Counts</h3>
          <div className="manual-field">
            {label("Thermals")}
            <input type="number" className="manual-input" value={form.thermalCount} placeholder="0" onChange={(e) => set("thermalCount", e.target.value)} />
          </div>
          <div className="manual-field">
            {label("Glides")}
            <input type="number" className="manual-input" value={form.glideCount} placeholder="0" onChange={(e) => set("glideCount", e.target.value)} />
          </div>
          <div className="manual-field">
            {label("Ridge runs")}
            <input type="number" className="manual-input" value={form.ridgeCount} placeholder="0" onChange={(e) => set("ridgeCount", e.target.value)} />
          </div>
        </section>

        <section className="manual-section">
          <h3>Wind</h3>
          <div className="manual-field">
            {label("Wind speed", fmt.labels.speed)}
            <input type="number" className="manual-input" value={form.windSpeed} placeholder="0" onChange={(e) => set("windSpeed", e.target.value)} />
          </div>
          <div className="manual-field">
            {label("Wind from", "°")}
            <input type="number" className="manual-input" value={form.windFromDeg} min={0} max={360} placeholder="0" onChange={(e) => set("windFromDeg", e.target.value)} />
          </div>
        </section>

        <section className="manual-section">
          <h3>XContest</h3>
          <div className="manual-field">
            {label("Link")}
            <input type="url" className="manual-input" value={form.xcUrl} placeholder="https://…" onChange={(e) => set("xcUrl", e.target.value)} />
          </div>
          <div className="manual-field">
            {label("Points")}
            <input type="number" className="manual-input" value={form.xcPoints} placeholder="0" onChange={(e) => set("xcPoints", e.target.value)} />
          </div>
        </section>

        <section className="manual-section">
          <h3>Note</h3>
          <textarea
            className="manual-textarea"
            value={form.note}
            placeholder="Add a note…"
            rows={3}
            onChange={(e) => set("note", e.target.value)}
          />
        </section>
      </div>
    </div>
  );
}
