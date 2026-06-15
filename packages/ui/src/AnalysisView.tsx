import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AnyPhase, Flight, Phase } from "@paranalyzer/core";
import { makeFormatter, type UnitSystem } from "@paranalyzer/core";
import { SummaryPanel } from "./components/SummaryPanel";
import { FlightMap } from "./components/FlightMap";
import { Barogram } from "./components/Barogram";
import { ThermalsTable } from "./components/ThermalsTable";
import { BadTurnsTable } from "./components/BadTurnsTable";
import { GlidesTable } from "./components/GlidesTable";
import { RidgeSoarsTable } from "./components/RidgeSoarsTable";
import { UnitToggle } from "./components/UnitToggle";

export interface AnalysisViewProps {
  flight: Flight;
  units?: UnitSystem;
  onUnitsChange?: (u: UnitSystem) => void;
  dateFormat?: "dmy" | "ymd";
}

export function AnalysisView({ flight, units: unitsProp, onUnitsChange, dateFormat = "dmy" }: AnalysisViewProps) {
  const [unitsLocal, setUnitsLocal] = useState<UnitSystem>(
    () => (localStorage.getItem("paranalyzer.units") as UnitSystem) || "metric",
  );
  const units = unitsProp ?? unitsLocal;

  const changeUnits = useCallback((next: UnitSystem) => {
    setUnitsLocal(next);
    localStorage.setItem("paranalyzer.units", next);
    onUnitsChange?.(next);
  }, [onUnitsChange]);

  const [selected, setSelected] = useState<AnyPhase | null>(null);
  const [hovered, setHovered] = useState<AnyPhase | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selected) {
      mapRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [selected]);

  const fmt = useMemo(() => makeFormatter(units), [units]);
  const activePhase = hovered ?? selected;
  const selectPhase = (p: Phase | null) => setSelected(p);
  const hoverPhase = (p: Phase | null) => setHovered(p);
  const tz = flight.meta.tzOffsetMinutes ?? 0;

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <UnitToggle value={units} onChange={changeUnits} />
      </div>
      <SummaryPanel flight={flight} fmt={fmt} dateFormat={dateFormat} />
      <div ref={mapRef}>
        <FlightMap flight={flight} highlight={activePhase} zoomTo={selected} hoverIdx={hoverIdx} />
      </div>
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
          tz={tz}
          selected={selected}
          onSelect={selectPhase}
          onHover={hoverPhase}
        />
        <BadTurnsTable
          badTurns={flight.badTurns}
          fmt={fmt}
          tz={tz}
          selected={selected}
          onSelect={selectPhase}
          onHover={hoverPhase}
        />
        <RidgeSoarsTable
          ridgeSoars={flight.ridgeSoars}
          fmt={fmt}
          tz={tz}
          selected={selected}
          onSelect={setSelected}
          onHover={setHovered}
        />
        <GlidesTable
          glides={flight.glides}
          fmt={fmt}
          tz={tz}
          selected={selected}
          onSelect={selectPhase}
          onHover={hoverPhase}
        />
      </div>
      <footer className="foot">
        {flight.meta.fileName} · {flight.fixes.length.toLocaleString()} fixes ·
        source {flight.meta.source.toUpperCase()} · click a row or the barogram to focus a phase
      </footer>
    </div>
  );
}
