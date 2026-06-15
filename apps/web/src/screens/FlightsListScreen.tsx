import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { loadDb, getSettings, saveSettings, deleteFlight } from "../data/db";
import { deleteTrack } from "../data/trackStore";
import type { FlightRecord, Settings } from "../data/model";
import { FlightsTable } from "../components/FlightsTable";
import { ColumnConfigSheet } from "../components/ColumnConfigSheet";
import { FilterBar } from "../components/FilterBar";
import { ImportButton } from "../components/ImportButton";

export function FlightsListScreen() {
  const navigate = useNavigate();
  const [flights, setFlights] = useState<FlightRecord[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [showColumnSheet, setShowColumnSheet] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [doc, cfg] = await Promise.all([loadDb(), getSettings()]);
      if (!cancelled) {
        setFlights(doc.flights);
        setSettings(cfg);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const persistSettings = async (next: Settings) => {
    setSettings(next);
    await saveSettings(next);
  };

  const handleDeleteFlight = async (id: string) => {
    const rec = flights.find((f) => f.id === id);
    if (rec) await deleteTrack(rec.trackRef);
    await deleteFlight(id);
    setFlights((prev) => prev.filter((f) => f.id !== id));
  };

  if (!settings) {
    return (
      <div className="screen">
        <header className="app-header">
          <span className="app-title">🪂 Paranalyzer</span>
        </header>
        <div className="loading">Loading…</div>
      </div>
    );
  }

  return (
    <div className="screen">
      <header className="app-header">
        <span className="app-title">🪂 Paranalyzer</span>
        <div className="header-actions">
          <button className="btn btn-sm btn-ghost" onClick={() => setShowFilters((v) => !v)}>
            {showFilters ? "Hide filters" : "Filter"}
          </button>
          <button className="btn btn-sm btn-ghost" onClick={() => setShowColumnSheet(true)}>
            Columns
          </button>
          <ImportButton />
          <button className="btn btn-sm btn-ghost" onClick={() => navigate("/settings")}>
            ⚙️
          </button>
        </div>
      </header>

      {showFilters && (
        <FilterBar
          filters={settings.filters}
          onChange={(filters) => persistSettings({ ...settings, filters })}
        />
      )}

      <div className="list-body">
        <FlightsTable
          flights={flights}
          sortRule={settings.sort}
          columns={settings.columns}
          filters={settings.filters}
          units={settings.units}
          onSortChange={(sort) => persistSettings({ ...settings, sort })}
          onColumnChange={(columns) => persistSettings({ ...settings, columns })}
          onDeleteFlight={handleDeleteFlight}
        />
      </div>

      {showColumnSheet && (
        <ColumnConfigSheet
          columns={settings.columns}
          onChange={(columns) => persistSettings({ ...settings, columns })}
          onClose={() => setShowColumnSheet(false)}
        />
      )}
    </div>
  );
}
