import type { AnyPhase, Thermal } from "@paranalyzer/core";
import { compassName, formatClock, formatDuration, PARAMS, type UnitFormatter } from "@paranalyzer/core";
import { WindBadge } from "./WindBadge";
import { useSortableRows } from "./useSortableRows";

interface Props {
  thermals: Thermal[];
  fmt: UnitFormatter;
  tz: number;
  selected: AnyPhase | null;
  minTurns?: number;
  bridgeGapSec?: number;
  onSelect: (p: Thermal | null) => void;
  onHover: (p: Thermal | null) => void;
}

const COLUMNS = [
  { key: "start", accessor: (t: Thermal) => t.startTime },
  { key: "dur", accessor: (t: Thermal) => t.duration },
  { key: "turns", accessor: (t: Thermal) => t.turns },
  { key: "climb", accessor: (t: Thermal) => t.climb },
  { key: "rate", accessor: (t: Thermal) => t.climbRate },
  { key: "radius", accessor: (t: Thermal) => t.avgRadius },
  { key: "wind", accessor: (t: Thermal) => t.wind?.speed ?? null },
];

function formatTurnThreshold(turns: number): string {
  const label = Number.isInteger(turns) ? String(turns) : turns.toFixed(1);
  return `≥ ${label} ${turns === 1 ? "turn" : "turns"}`;
}

export function ThermalsTable({
  thermals,
  fmt,
  tz,
  selected,
  minTurns = PARAMS.thermalMinTurns,
  bridgeGapSec = PARAMS.bridgeGapSec,
  onSelect,
  onHover,
}: Props) {
  const { sorted, toggle, indicator } = useSortableRows(thermals, COLUMNS);
  const origIndex = new Map(thermals.map((t, i) => [t, i + 1]));
  const totalDuration = thermals.reduce((sum, t) => sum + t.duration, 0);

  return (
    <div className="card table-card">
      <div className="panel-title">
        Thermals <span className="count">{thermals.length}</span>
        <span className="count">{formatDuration(totalDuration)}</span>
        <span className="panel-hint">{formatTurnThreshold(minTurns)}, bridge ≤ {bridgeGapSec}s</span>
      </div>
      {thermals.length === 0 ? (
        <p className="empty">No well-formed thermals detected.</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th className="sortable" onClick={() => toggle("start")}>Start{indicator("start")}</th>
                <th className="sortable" onClick={() => toggle("dur")}>Dur{indicator("dur")}</th>
                <th className="sortable" onClick={() => toggle("turns")}>Turns{indicator("turns")}</th>
                <th className="sortable" onClick={() => toggle("climb")}>Climb{indicator("climb")}</th>
                <th className="sortable" onClick={() => toggle("rate")}>Rate{indicator("rate")}</th>
                <th className="sortable" onClick={() => toggle("radius")}>Radius{indicator("radius")}</th>
                <th className="sortable" onClick={() => toggle("wind")}>Wind{indicator("wind")}</th>
              </tr>
            </thead>
            <tbody onMouseLeave={() => onHover(null)}>
              {sorted.map((t) => (
                <tr
                  key={origIndex.get(t)}
                  className={selected === t ? "row-selected" : ""}
                  onClick={() => onSelect(selected === t ? null : t)}
                  onMouseEnter={() => onHover(t)}
                >
                  <td className="dim">{origIndex.get(t)}</td>
                  <td>{formatClock(t.startTime, tz)}</td>
                  <td>{formatDuration(t.duration)}</td>
                  <td>{t.turns.toFixed(1)}</td>
                  <td className="climb">+{fmt.altitude(t.climb)}</td>
                  <td>{fmt.vario(t.climbRate)}</td>
                  <td>{fmt.smallDistance(t.avgRadius)}</td>
                  <td className="wind-cell">
                    {t.wind ? (
                      <span className="wind-inline">
                        <WindBadge wind={t.wind} fmt={fmt} size={16} showLabel={false} />
                        {compassName(t.wind.fromDeg)} {fmt.speed(t.wind.speed, 0)}
                      </span>
                    ) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
