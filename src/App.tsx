import { useCallback, useMemo, useState } from "react";
import type { Flight, Phase } from "./types";
import { parseTrack } from "./parsers";
import { analyzeFlight } from "./analysis/analyze";
import { makeFormatter, type UnitSystem } from "./units";
import { FileDrop } from "./components/FileDrop";
import { SummaryPanel } from "./components/SummaryPanel";
import { FlightMap } from "./components/FlightMap";
import { Barogram } from "./components/Barogram";
import { ThermalsTable } from "./components/ThermalsTable";
import { BadTurnsTable } from "./components/BadTurnsTable";
import { GlidesTable } from "./components/GlidesTable";
import { UnitToggle } from "./components/UnitToggle";

const SAMPLE_URL = `${import.meta.env.BASE_URL}sample-woodrat.igc`;

export default function App() {
  const [flight, setFlight] = useState<Flight | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [units, setUnits] = useState<UnitSystem>(
    () => (localStorage.getItem("paranalyzer.units") as UnitSystem) || "metric",
  );

  const [selected, setSelected] = useState<Phase | null>(null);
  const [hovered, setHovered] = useState<Phase | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const fmt = useMemo(() => makeFormatter(units), [units]);
  const activePhase = hovered ?? selected;

  const changeUnits = (next: UnitSystem) => {
    setUnits(next);
    localStorage.setItem("paranalyzer.units", next);
  };

  const loadText = useCallback((name: string, text: string) => {
    try {
      const parsed = parseTrack(name, text);
      const analysed = analyzeFlight(parsed);
      setFlight(analysed);
      setSelected(null);
      setHovered(null);
      setHoverIdx(null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read that file.");
    }
  }, []);

  const loadSample = useCallback(async () => {
    try {
      const res = await fetch(SAMPLE_URL);
      if (!res.ok) throw new Error("Sample flight could not be loaded.");
      loadText("sample-woodrat.igc", await res.text());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sample load failed.");
    }
  }, [loadText]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">🪂</span>
          <div>
            <h1>Paranalyzer</h1>
            <p>Paragliding flight analysis — in your browser</p>
          </div>
        </div>
        <div className="topbar-actions">
          {flight && (
            <FileDrop onFile={loadText} onSample={loadSample} compact />
          )}
          <UnitToggle value={units} onChange={changeUnits} />
        </div>
      </header>

      {!flight ? (
        <main className="hero">
          <FileDrop onFile={loadText} onSample={loadSample} error={error} />
          <ul className="hero-features">
            <li>📊 XContest-style stats: airtime, altitude, climb, distance</li>
            <li>🌀 Thermal breakdown — turns, climb, rate, radius</li>
            <li>➡️ Glide analysis — direction, speed, glide ratio, wind</li>
            <li>🔒 100% client-side — your track never leaves your device</li>
          </ul>
        </main>
      ) : (
        <main className="dashboard">
          {error && <div className="filedrop-error inline">{error}</div>}
          <SummaryPanel flight={flight} fmt={fmt} />

          <FlightMap
            flight={flight}
            highlight={activePhase}
            zoomTo={selected}
            hoverIdx={hoverIdx}
          />

          <Barogram
            flight={flight}
            fmt={fmt}
            active={activePhase}
            hoverIdx={hoverIdx}
            onHoverIdx={setHoverIdx}
            onSelect={setSelected}
          />

          <div className="tables">
            <ThermalsTable
              thermals={flight.thermals}
              fmt={fmt}
              tz={flight.meta.tzOffsetMinutes ?? 0}
              selected={selected}
              onSelect={setSelected}
              onHover={setHovered}
            />
            <BadTurnsTable
              badTurns={flight.badTurns}
              fmt={fmt}
              tz={flight.meta.tzOffsetMinutes ?? 0}
              selected={selected}
              onSelect={setSelected}
              onHover={setHovered}
            />
            <GlidesTable
              glides={flight.glides}
              fmt={fmt}
              tz={flight.meta.tzOffsetMinutes ?? 0}
              selected={selected}
              onSelect={setSelected}
              onHover={setHovered}
            />
          </div>

          <footer className="foot">
            {flight.meta.fileName} · {flight.fixes.length.toLocaleString()} fixes ·
            source {flight.meta.source.toUpperCase()} · click a row or the
            barogram to focus a phase
          </footer>
        </main>
      )}
    </div>
  );
}
