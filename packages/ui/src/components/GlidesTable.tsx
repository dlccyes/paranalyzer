import type { Glide, Phase, WindEstimate } from "@paranalyzer/core";
import { angleDiff, compassName, formatClock, formatDuration, type UnitFormatter } from "@paranalyzer/core";
import { WindBadge } from "./WindBadge";
import { Arrow } from "./Arrow";

interface Props {
  glides: Glide[];
  fmt: UnitFormatter;
  tz: number;
  selected: Phase | null;
  onSelect: (p: Phase | null) => void;
  onHover: (p: Phase | null) => void;
}

function windAngle(course: number, wind: WindEstimate | null): number | null {
  if (!wind) return null;
  const windToward = (wind.fromDeg + 180) % 360;
  return Math.abs(angleDiff(course, windToward));
}

function relationLabel(angle: number): string {
  if (angle <= 45) return "tail";
  if (angle >= 135) return "head";
  return "cross";
}

function sinkClass(sink: number): string {
  if (sink > 1) return "sink";
  if (sink < -1) return "climb";
  return "";
}

export function GlidesTable({ glides, fmt, tz, selected, onSelect, onHover }: Props) {
  return (
    <div className="card table-card wide">
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
                <th>#</th><th>Start</th><th>Dur</th><th>Course</th><th>Dist</th>
                <th>Speed</th><th>Sink</th><th>Sink rate</th><th>Glide</th>
                <th>Wind</th><th title="Angle between course and wind (0° = tailwind)">vs wind</th>
              </tr>
            </thead>
            <tbody onMouseLeave={() => onHover(null)}>
              {glides.map((g, i) => {
                const angle = windAngle(g.course, g.wind);
                return (
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
                      <span className="course-badge">
                        <Arrow deg={g.course} size={16} title={`Course ${Math.round(g.course)}°`} />
                        {compassName(g.course)}
                      </span>
                    </td>
                    <td>{fmt.distance(g.trackDistance)}</td>
                    <td>{fmt.speed(g.groundSpeed)}</td>
                    <td className={sinkClass(g.totalSink)}>{fmt.altitude(g.totalSink)}</td>
                    <td className={sinkClass(g.totalSink)}>{fmt.vario(g.avgSinkRate)}</td>
                    <td className="glide-ratio">
                      {g.glideRatio != null ? `${g.glideRatio.toFixed(1)}:1` : "—"}
                    </td>
                    <td className="wind-cell">
                      {g.wind ? (
                        <span className="wind-inline">
                          <WindBadge wind={g.wind} fmt={fmt} size={16} showLabel={false} />
                          {compassName(g.wind.fromDeg)} {fmt.speed(g.wind.speed, 0)}
                        </span>
                      ) : "—"}
                    </td>
                    <td>
                      {angle != null ? (
                        <span className={`vs-wind ${relationLabel(angle)}`}>
                          {Math.round(angle)}°{" "}
                          <span className="rel">{relationLabel(angle)}</span>
                        </span>
                      ) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
