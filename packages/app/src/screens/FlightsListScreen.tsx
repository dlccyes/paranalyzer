import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { loadDb, getSettings, saveSettings, deleteFlight } from "../data/db";
import { deleteTrack } from "../data/trackStore";
import { ANALYSIS_VERSION, type FlightRecord, type Settings } from "../data/model";
import { recalcAll } from "../data/recalc";
import { FlightsTable } from "../components/FlightsTable";
import { ColumnConfigSheet } from "../components/ColumnConfigSheet";
import { FilterBar } from "../components/FilterBar";
import { ImportButton } from "../components/ImportButton";
import { TimeBreakdownChart } from "@paranalyzer/ui";

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
      const stale = doc.flights.some((f) =>
        f.analysisVersion < ANALYSIS_VERSION || f.timeInGlide == null,
      );
      if (stale) {
        await recalcAll();
        const refreshed = await loadDb();
        if (!cancelled) setFlights([...refreshed.flights]);
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

  const gliders = useMemo(() => {
    const seen = new Set<string>();
    for (const f of flights) {
      if (f.glider) seen.add(f.glider);
    }
    return [...seen].sort();
  }, [flights]);

  const timeBreakdown = useMemo(() => {
    return flights.reduce(
      (acc, f) => ({
        airtime: acc.airtime + f.airtime,
        thermal: acc.thermal + f.timeInThermal,
        glide: acc.glide + (f.timeInGlide ?? 0),
        ridge: acc.ridge + f.timeInRidge,
      }),
      { airtime: 0, thermal: 0, glide: 0, ridge: 0 },
    );
  }, [flights]);

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
          units={settings.units}
          sites={settings.sites}
          gliders={gliders}
        />
      )}

      <details className="dashboard-panel list-dashboard card" open>
        <summary>
          <div className="panel-title">Dashboard</div>
        </summary>
        <TimeBreakdownChart breakdown={timeBreakdown} />
      </details>

      <div className="list-body">
        <FlightsTable
          flights={flights}
          sortRule={settings.sort}
          columns={settings.columns}
          filters={settings.filters}
          units={settings.units}
          dateFormat={settings.dateFormat}
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
