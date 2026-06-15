import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { Flight } from "@paranalyzer/core";
import { parseTrack, analyzeFlight } from "@paranalyzer/core";
import { AnalysisView } from "@paranalyzer/ui";
import { getFlight, updateNote, getSettings } from "../data/db";
import { readTrack } from "../data/trackStore";
import { NoteEditor } from "../components/NoteEditor";
import type { FlightRecord } from "../data/model";
import type { UnitSystem } from "@paranalyzer/core";

export function FlightDetailScreen() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [rec, setRec] = useState<FlightRecord | null>(null);
  const [flight, setFlight] = useState<Flight | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [units, setUnits] = useState<UnitSystem>("metric");

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const cfg = await getSettings();
        if (cancelled) return;
        setUnits(cfg.units);
        const record = getFlight(id);
        if (!record) { setNotFound(true); return; }
        setRec(record);
        const text = await readTrack(record.trackRef);
        if (cancelled) return;
        const parsed = parseTrack(record.fileName ?? `flight.${record.source}`, text);
        const analysed = analyzeFlight(parsed);
        if (!cancelled) setFlight(analysed);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load flight");
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

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

  return (
    <div className="screen">
      <header className="app-header">
        <button className="btn btn-sm btn-ghost" onClick={() => navigate(-1)}>← Back</button>
        <span className="app-title">{rec?.fileName ?? "Flight"}</span>
      </header>

      <div className="detail-body">
        {error && <div className="error-banner">{error}</div>}
        {!flight && !error && <div className="loading">Analyzing…</div>}
        {flight && rec && (
          <>
            <AnalysisView
              flight={flight}
              units={units}
              onUnitsChange={setUnits}
            />
            <NoteEditor
              value={rec.note}
              onSave={(text) => updateNote(rec.id, text)}
            />
          </>
        )}
      </div>
    </div>
  );
}
