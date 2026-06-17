import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { loadDb, getSettings, saveSettings, deleteFlight } from "../data/db";
import { deleteTrack } from "../data/trackStore";
import { ANALYSIS_VERSION, type FlightRecord, type FilterRule, type Settings } from "../data/model";
import { recalcAll } from "../data/recalc";
import { applyFilters } from "../data/filter";
import { siteBreakdown, type SiteMetric } from "../data/breakdown";
import { FlightsTable } from "../components/FlightsTable";
import { ColumnConfigSheet } from "../components/ColumnConfigSheet";
import { FilterBar } from "../components/FilterBar";
import { ImportButton } from "../components/ImportButton";
import { TimeBreakdownChart, SiteBreakdownChart } from "@paranalyzer/ui";

export function FlightsListScreen() {
  const navigate = useNavigate();
  const [flights, setFlights] = useState<FlightRecord[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [showColumnSheet, setShowColumnSheet] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showOverflowMenu, setShowOverflowMenu] = useState(false);
  const [siteMetric, setSiteMetric] = useState<SiteMetric>("airtime");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [doc, cfg] = await Promise.all([loadDb(), getSettings()]);
      if (!cancelled) {
        setFlights(doc.flights);
        setSettings(cfg);
      }
      const stale = doc.flights.some((f) =>
        !f.manual && (f.analysisVersion < ANALYSIS_VERSION || f.timeInGlide == null),
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

  const filtered = useMemo(
    () => applyFilters(flights, settings?.filters ?? []),
    [flights, settings?.filters],
  );

  const timeBreakdown = useMemo(() => {
    return filtered.reduce(
      (acc, f) => ({
        airtime: acc.airtime + f.airtime,
        thermal: acc.thermal + f.timeInThermal,
        glide: acc.glide + (f.timeInGlide ?? 0),
        ridge: acc.ridge + f.timeInRidge,
      }),
      { airtime: 0, thermal: 0, glide: 0, ridge: 0 },
    );
  }, [filtered]);

  const siteData = useMemo(() => siteBreakdown(filtered, siteMetric), [filtered, siteMetric]);

  const activeSiteFilter = settings?.filters.find(
    (f) => f.field === "site" && f.op === "equals",
  )?.value as string | undefined;

  function toggleSiteFilter(site: string) {
    if (!settings) return;
    const others = settings.filters.filter((f) => f.field !== "site");
    const alreadyThis = activeSiteFilter === site;
    const next: FilterRule[] = alreadyThis
      ? others
      : [...others, { field: "site", op: "equals", value: site }];
    persistSettings({ ...settings, filters: next });
  }

  function selectSiteMetric(key: string) {
    setSiteMetric((m) => (m === key ? "airtime" : (key as SiteMetric)));
  }

  if (!settings) {
    return (
      <div className="screen">
        <header className="app-header">
          <span className="app-title app-brand">
            <span className="app-brand-mark" aria-hidden="true">🪂</span>
            <span className="app-brand-text">Paranalyzer</span>
          </span>
        </header>
        <div className="loading">Loading…</div>
      </div>
    );
  }

  return (
    <div className="screen">
      <header className="app-header">
        <span className="app-title app-brand">
          <span className="app-brand-mark" aria-hidden="true">🪂</span>
          <span className="app-brand-text">Paranalyzer</span>
        </span>
        <div className="header-actions">
          {/* Secondary actions — hidden on narrow screens, shown via overflow menu */}
          <button className="btn btn-sm btn-ghost header-btn-wide" onClick={() => setShowFilters((v) => !v)}>
            {showFilters ? "Hide filters" : "Filter"}
          </button>
          <button className="btn btn-sm btn-ghost header-btn-wide" onClick={() => setShowColumnSheet(true)}>
            Columns
          </button>
          <ImportButton onImported={async () => {
            const doc = await loadDb();
            setFlights([...doc.flights]);
          }} />
          <button className="btn btn-sm btn-ghost header-btn-wide" onClick={() => navigate("/flight/new")}>
            + Manual
          </button>
          <button className="btn btn-sm btn-ghost header-btn-wide" onClick={() => navigate("/settings")}>
            ⚙️
          </button>
          {/* Overflow button — only visible on narrow screens */}
          <button className="btn btn-sm btn-ghost header-btn-narrow" onClick={() => setShowOverflowMenu(true)}>
            ⋯
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

      <div className="list-body">
        <details className="dashboard-panel list-dashboard card" open>
          <summary>
            <div className="panel-title">Dashboard</div>
          </summary>
          <div className="dashboard-charts">
            <TimeBreakdownChart
              breakdown={timeBreakdown}
              activeKey={siteMetric !== "airtime" ? siteMetric : null}
              onSegmentClick={selectSiteMetric}
            />
            <SiteBreakdownChart
              data={siteData}
              metric={siteMetric}
              activeKey={activeSiteFilter ?? null}
              onSegmentClick={toggleSiteFilter}
            />
          </div>
        </details>

        <FlightsTable
          flights={filtered}
          sortRule={settings.sort}
          columns={settings.columns}
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

      {showOverflowMenu && (
        <div className="sheet-backdrop" onClick={() => setShowOverflowMenu(false)}>
          <div className="sheet overflow-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-header">
              <span className="sheet-title">Menu</span>
              <button className="btn btn-sm btn-ghost" onClick={() => setShowOverflowMenu(false)}>✕</button>
            </div>
            <div className="overflow-menu-items">
              <button className="overflow-menu-item" onClick={() => { setShowFilters((v) => !v); setShowOverflowMenu(false); }}>
                <span>Filter</span>
                {showFilters && <span className="overflow-menu-badge">On</span>}
              </button>
              <button className="overflow-menu-item" onClick={() => { setShowColumnSheet(true); setShowOverflowMenu(false); }}>
                Columns
              </button>
              <button className="overflow-menu-item" onClick={() => { navigate("/flight/new"); setShowOverflowMenu(false); }}>
                + Manual flight
              </button>
              <button className="overflow-menu-item" onClick={() => { navigate("/settings"); setShowOverflowMenu(false); }}>
                Settings
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
