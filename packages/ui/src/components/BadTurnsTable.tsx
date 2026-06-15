import type { BadTurn, Phase } from "@paranalyzer/core";
import { formatClock, formatDuration, type UnitFormatter } from "@paranalyzer/core";

interface Props {
  badTurns: BadTurn[];
  fmt: UnitFormatter;
  tz: number;
  selected: Phase | null;
  onSelect: (p: Phase | null) => void;
  onHover: (p: Phase | null) => void;
}

export function BadTurnsTable({ badTurns, fmt, tz, selected, onSelect, onHover }: Props) {
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
                <th>#</th><th>Start</th><th>Dur</th><th>Turns</th>
                <th>Alt</th><th>Rate</th><th>Radius</th>
              </tr>
            </thead>
            <tbody onMouseLeave={() => onHover(null)}>
              {badTurns.map((t, i) => (
                <tr
                  key={i}
                  className={selected === t ? "row-selected" : ""}
                  onClick={() => onSelect(selected === t ? null : t)}
                  onMouseEnter={() => onHover(t)}
                >
                  <td className="dim">{i + 1}</td>
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
