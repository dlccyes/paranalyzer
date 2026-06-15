import type { AnyPhase, RidgeSoar } from "@paranalyzer/core";
import { formatClock, formatDuration, RIDGE_PARAMS, type UnitFormatter } from "@paranalyzer/core";
import { useSortableRows } from "./useSortableRows";

interface Props {
  ridgeSoars: RidgeSoar[];
  fmt: UnitFormatter;
  tz: number;
  selected: AnyPhase | null;
  bridgeGapSec?: number;
  onSelect: (r: RidgeSoar | null) => void;
  onHover: (r: RidgeSoar | null) => void;
}

const COLUMNS = [
  { key: "start", accessor: (r: RidgeSoar) => r.startTime },
  { key: "dur", accessor: (r: RidgeSoar) => r.duration },
  { key: "dist", accessor: (r: RidgeSoar) => r.trackDistance },
  { key: "alt", accessor: (r: RidgeSoar) => r.altChange },
  { key: "avgalt", accessor: (r: RidgeSoar) => r.avgAlt },
  { key: "passes", accessor: (r: RidgeSoar) => r.passes },
];

export function RidgeSoarsTable({
  ridgeSoars,
  fmt,
  tz,
  selected,
  bridgeGapSec = RIDGE_PARAMS.bridgeGapSec,
  onSelect,
  onHover,
}: Props) {
  const { sorted, toggle, indicator } = useSortableRows(ridgeSoars, COLUMNS);
  const origIndex = new Map(ridgeSoars.map((r, i) => [r, i + 1]));
  const totalDuration = ridgeSoars.reduce((sum, r) => sum + r.duration, 0);

  const signedAlt = (m: number) =>
    `${m >= 0 ? "+" : "−"}${fmt.altitude(Math.abs(m))}`;

  return (
    <div className="card table-card">
      <div className="panel-title">
        Ridge soaring <span className="count">{ridgeSoars.length}</span>
        <span className="count">{formatDuration(totalDuration)}</span>
        <span className="panel-hint">non-circling, bridge &lt; {bridgeGapSec}s</span>
      </div>
      {ridgeSoars.length === 0 ? (
        <p className="empty">No ridge soaring detected.</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th className="sortable" onClick={() => toggle("start")}>Start{indicator("start")}</th>
                <th className="sortable" onClick={() => toggle("dur")}>Dur{indicator("dur")}</th>
                <th className="sortable" onClick={() => toggle("dist")}>Dist{indicator("dist")}</th>
                <th className="sortable" onClick={() => toggle("alt")}>Alt Δ{indicator("alt")}</th>
                <th className="sortable" onClick={() => toggle("avgalt")}>Avg alt{indicator("avgalt")}</th>
                <th className="sortable" title="Heading reversals (informational)" onClick={() => toggle("passes")}>Passes{indicator("passes")}</th>
              </tr>
            </thead>
            <tbody onMouseLeave={() => onHover(null)}>
              {sorted.map((r) => (
                <tr
                  key={origIndex.get(r)}
                  className={selected === r ? "row-selected" : ""}
                  onClick={() => onSelect(selected === r ? null : r)}
                  onMouseEnter={() => onHover(r)}
                >
                  <td className="dim">{origIndex.get(r)}</td>
                  <td>{formatClock(r.startTime, tz)}</td>
                  <td>{formatDuration(r.duration)}</td>
                  <td>{fmt.distance(r.trackDistance)}</td>
                  <td className={r.altChange >= 0 ? "climb" : ""}>{signedAlt(r.altChange)}</td>
                  <td>{fmt.altitude(r.avgAlt)}</td>
                  <td className="dim">{r.passes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
