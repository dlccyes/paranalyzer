import type { Glide, Phase } from "../types";
import { compassName } from "../analysis/geo";
import { formatClock, formatDuration, type UnitFormatter } from "../units";
import { WindBadge } from "./WindBadge";

interface Props {
  glides: Glide[];
  fmt: UnitFormatter;
  tz: number;
  selected: Phase | null;
  onSelect: (p: Phase | null) => void;
  onHover: (p: Phase | null) => void;
}

/** Table of straight-line glides between thermals. */
export function GlidesTable({
  glides,
  fmt,
  tz,
  selected,
  onSelect,
  onHover,
}: Props) {
  return (
    <div className="card table-card">
      <div className="panel-title">
        Glides <span className="count">{glides.length}</span>
        <span className="panel-hint">straight lines</span>
      </div>
      {glides.length === 0 ? (
        <p className="empty">No glides detected.</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Start</th>
                <th>Dur</th>
                <th>Course</th>
                <th>Dist</th>
                <th>Speed</th>
                <th>Glide</th>
                <th>Wind</th>
              </tr>
            </thead>
            <tbody onMouseLeave={() => onHover(null)}>
              {glides.map((g, i) => (
                <tr
                  key={i}
                  className={selected === g ? "row-selected" : ""}
                  onClick={() => onSelect(selected === g ? null : g)}
                  onMouseEnter={() => onHover(g)}
                >
                  <td className="dim">{i + 1}</td>
                  <td>{formatClock(g.startTime, tz)}</td>
                  <td>{formatDuration(g.duration)}</td>
                  <td>
                    <span className="course">{compassName(g.course)}</span>{" "}
                    <span className="dim">{Math.round(g.course)}°</span>
                  </td>
                  <td>{fmt.distance(g.trackDistance)}</td>
                  <td>{fmt.speed(g.groundSpeed)}</td>
                  <td className="glide-ratio">
                    {g.glideRatio != null ? `${g.glideRatio.toFixed(1)}:1` : "—"}
                  </td>
                  <td className="wind-cell">
                    {g.wind ? (
                      <span className="wind-inline">
                        <WindBadge wind={g.wind} fmt={fmt} size={16} showLabel={false} />
                        {compassName(g.wind.fromDeg)} {fmt.speed(g.wind.speed, 0)}
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
