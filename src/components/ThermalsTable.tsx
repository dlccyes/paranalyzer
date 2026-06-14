import type { Phase, Thermal } from "../types";
import { compassName } from "../analysis/geo";
import { formatClock, formatDuration, type UnitFormatter } from "../units";
import { WindBadge } from "./WindBadge";

interface Props {
  thermals: Thermal[];
  fmt: UnitFormatter;
  tz: number;
  selected: Phase | null;
  onSelect: (p: Phase | null) => void;
  onHover: (p: Phase | null) => void;
}

/** Table of well-formed thermals (≥3 turns). */
export function ThermalsTable({
  thermals,
  fmt,
  tz,
  selected,
  onSelect,
  onHover,
}: Props) {
  return (
    <div className="card table-card">
      <div className="panel-title">
        Thermals <span className="count">{thermals.length}</span>
        <span className="panel-hint">≥ 3 turns</span>
      </div>
      {thermals.length === 0 ? (
        <p className="empty">No well-formed thermals detected.</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Start</th>
                <th>Dur</th>
                <th>Turns</th>
                <th>Climb</th>
                <th>Rate</th>
                <th>Radius</th>
                <th>Wind</th>
              </tr>
            </thead>
            <tbody onMouseLeave={() => onHover(null)}>
              {thermals.map((t, i) => (
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
                    <span className="turn-dir">{t.direction === 1 ? "↻" : "↺"}</span>
                  </td>
                  <td className="climb">+{fmt.altitude(t.climb)}</td>
                  <td>{fmt.vario(t.climbRate)}</td>
                  <td>{fmt.smallDistance(t.avgRadius)}</td>
                  <td className="wind-cell">
                    {t.wind ? (
                      <span className="wind-inline">
                        <WindBadge wind={t.wind} fmt={fmt} size={16} showLabel={false} />
                        {compassName(t.wind.fromDeg)} {fmt.speed(t.wind.speed, 0)}
                      </span>
                    ) : (
                      "—"
                    )}
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
