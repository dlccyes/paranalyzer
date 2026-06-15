import type { Glide, Phase, WindEstimate } from "@paranalyzer/core";
import { angleDiff, compassName, formatClock, formatDuration, type UnitFormatter } from "@paranalyzer/core";
import { WindBadge } from "./WindBadge";
import { Arrow } from "./Arrow";
import { useSortableRows } from "./useSortableRows";

interface Props {
  glides: Glide[];
  fmt: UnitFormatter;
  tz: number;
  selected: Phase | null;
  onSelect: (p: Phase | null) => void;
  onHover: (p: Phase | null) => void;
}

const COLUMNS = [
  { key: "start", accessor: (g: Glide) => g.startTime },
  { key: "dur", accessor: (g: Glide) => g.duration },
  { key: "course", accessor: (g: Glide) => g.course },
  { key: "dist", accessor: (g: Glide) => g.trackDistance },
  { key: "speed", accessor: (g: Glide) => g.groundSpeed },
  { key: "sink", accessor: (g: Glide) => g.totalSink },
  { key: "sinkrate", accessor: (g: Glide) => g.avgSinkRate },
  { key: "glide", accessor: (g: Glide) => g.glideRatio ?? null },
  { key: "wind", accessor: (g: Glide) => g.wind?.speed ?? null },
  { key: "vswind", accessor: (g: Glide) => windAngle(g.course, g.wind) },
];

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
  const { sorted, toggle, indicator } = useSortableRows(glides, COLUMNS);
  const origIndex = new Map(glides.map((g, i) => [g, i + 1]));

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
                <th>#</th>
                <th className="sortable" onClick={() => toggle("start")}>Start{indicator("start")}</th>
                <th className="sortable" onClick={() => toggle("dur")}>Dur{indicator("dur")}</th>
                <th className="sortable" onClick={() => toggle("course")}>Course{indicator("course")}</th>
                <th className="sortable" onClick={() => toggle("dist")}>Dist{indicator("dist")}</th>
                <th className="sortable" onClick={() => toggle("speed")}>Speed{indicator("speed")}</th>
                <th className="sortable" onClick={() => toggle("sink")}>Sink{indicator("sink")}</th>
                <th className="sortable" onClick={() => toggle("sinkrate")}>Sink rate{indicator("sinkrate")}</th>
                <th className="sortable" onClick={() => toggle("glide")}>Glide{indicator("glide")}</th>
                <th className="sortable" onClick={() => toggle("wind")}>Wind{indicator("wind")}</th>
                <th
                  className="sortable"
                  title="Angle between course and wind (0° = tailwind)"
                  onClick={() => toggle("vswind")}
                >vs wind{indicator("vswind")}</th>
              </tr>
            </thead>
            <tbody onMouseLeave={() => onHover(null)}>
              {sorted.map((g) => {
                const angle = windAngle(g.course, g.wind);
                return (
                  <tr
                    key={origIndex.get(g)}
                    className={selected === g ? "row-selected" : ""}
                    onClick={() => onSelect(selected === g ? null : g)}
                    onMouseEnter={() => onHover(g)}
                  >
                    <td className="dim">{origIndex.get(g)}</td>
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
