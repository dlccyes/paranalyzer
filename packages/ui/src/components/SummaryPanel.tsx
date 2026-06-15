import type { Flight } from "@paranalyzer/core";
import {
  formatClock,
  formatDate,
  formatDuration,
  formatDurationHM,
  formatTzOffset,
  type UnitFormatter,
} from "@paranalyzer/core";
import { WindBadge } from "./WindBadge";

interface Props {
  flight: Flight;
  fmt: UnitFormatter;
  dateFormat?: "dmy" | "ymd";
}

export function SummaryPanel({ flight, fmt, dateFormat = "dmy" }: Props) {
  const { meta, stats } = flight;
  const tz = meta.tzOffsetMinutes ?? 0;
  const tzLabel = meta.tzOffsetMinutes != null ? formatTzOffset(tz) : "UTC";

  const stat = (label: string, value: string, sub?: string) => (
    <div className="stat">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );

  return (
    <section className="summary card">
      <div className="summary-head">
        <div className="summary-meta">
          <dl>
            {meta.pilot && (<><dt>Pilot</dt><dd>{meta.pilot}</dd></>)}
            <dt>Date</dt>
            <dd>
              {formatDate(stats.start, tz, dateFormat)} {formatClock(stats.start, tz)}{" "}
              <span className="muted">{tzLabel}</span>
            </dd>
            {meta.site && (<><dt>Launch</dt><dd>{meta.site}</dd></>)}
            {meta.gliderType && (<><dt>Glider</dt><dd>{meta.gliderType}</dd></>)}
            <dt>Wind</dt>
            <dd><WindBadge wind={stats.wind} fmt={fmt} /></dd>
          </dl>
        </div>

        <div className="stat-grid">
          {stat("Airtime", formatDuration(stats.airtime, true))}
          {stat("Time in thermal", formatDurationHM(stats.timeInThermal),
            stats.airtime > 0 ? `${Math.round((stats.timeInThermal / stats.airtime) * 100)}% of airtime` : undefined)}
          {stat("Time in ridge soaring", formatDurationHM(stats.timeInRidge),
            stats.airtime > 0 ? `${Math.round((stats.timeInRidge / stats.airtime) * 100)}% of airtime` : undefined)}
          {stat("Max altitude", fmt.altitude(stats.maxAlt))}
          {stat("Max alt. gain", fmt.altitude(stats.maxAltGain))}
          {stat("Max climb", fmt.vario(stats.maxClimb), "sustained 30 s")}
          {stat("Max sink", fmt.vario(-stats.maxSink), "sustained 30 s")}
          {stat("Track length", fmt.distance(stats.trackLength))}
          {stat("Straight dist.", fmt.distance(stats.straightDistance), "takeoff → landing")}
          {stat("Free distance", fmt.distance(stats.freeDistance), "up to 3 turnpoints")}
          {stat("Avg ground speed", fmt.speed(stats.avgSpeed))}
          {stats.xcScore.points > 0 && stat(
            "XContest score",
            `${stats.xcScore.points.toFixed(2)} pts`,
            stats.xcScore.type || undefined,
          )}
        </div>
      </div>
    </section>
  );
}
