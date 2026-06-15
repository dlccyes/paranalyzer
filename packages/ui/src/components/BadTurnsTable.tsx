import type { BadTurn, Phase } from "@paranalyzer/core";
import { formatClock, formatDuration, type UnitFormatter } from "@paranalyzer/core";
import { useSortableRows } from "./useSortableRows";

interface Props {
  badTurns: BadTurn[];
  fmt: UnitFormatter;
  tz: number;
  selected: Phase | null;
  onSelect: (p: Phase | null) => void;
  onHover: (p: Phase | null) => void;
}

const COLUMNS = [
  { key: "start", accessor: (t: BadTurn) => t.startTime },
  { key: "dur", accessor: (t: BadTurn) => t.duration },
  { key: "turns", accessor: (t: BadTurn) => t.turns },
  { key: "alt", accessor: (t: BadTurn) => t.altChange },
  { key: "rate", accessor: (t: BadTurn) => t.climbRate },
  { key: "radius", accessor: (t: BadTurn) => t.avgRadius },
];

export function BadTurnsTable({ badTurns, fmt, tz, selected, onSelect, onHover }: Props) {
  const { sorted, toggle, indicator } = useSortableRows(badTurns, COLUMNS);
  const origIndex = new Map(badTurns.map((t, i) => [t, i + 1]));

  const signedAlt = (m: number) =>
    `${m >= 0 ? "+" : "−"}${fmt.altitude(Math.abs(m))}`;

  return (
    <div className="card table-card">
      <div className="panel-title">
        Bad turns <span className="count">{badTurns.length}</span>
        <span className="panel-hint">&gt;1 turn, no climb</span>
      </div>
      {badTurns.length === 0 ? (
        <p className="empty">None — no circling wasted in zero or sink. 👌</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th className="sortable" onClick={() => toggle("start")}>Start{indicator("start")}</th>
                <th className="sortable" onClick={() => toggle("dur")}>Dur{indicator("dur")}</th>
                <th className="sortable" onClick={() => toggle("turns")}>Turns{indicator("turns")}</th>
                <th className="sortable" onClick={() => toggle("alt")}>Alt{indicator("alt")}</th>
                <th className="sortable" onClick={() => toggle("rate")}>Rate{indicator("rate")}</th>
                <th className="sortable" onClick={() => toggle("radius")}>Radius{indicator("radius")}</th>
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
                  <td>
                    {t.turns.toFixed(1)}
                    <span className="turn-dir bad">{t.direction === 1 ? "↻" : "↺"}</span>
                  </td>
                  <td className="sink">{signedAlt(t.altChange)}</td>
                  <td>{fmt.vario(t.climbRate)}</td>
                  <td>{fmt.smallDistance(t.avgRadius)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
