import type { Flight } from "../types";
import {
  formatClock,
  formatDate,
  formatDuration,
  formatTzOffset,
  type UnitFormatter,
} from "../units";
import { WindBadge } from "./WindBadge";

interface Props {
  flight: Flight;
  fmt: UnitFormatter;
}

/** XContest-style flight header + key statistics grid. */
export function SummaryPanel({ flight, fmt }: Props) {
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
            {meta.pilot && (
              <>
                <dt>Pilot</dt>
                <dd>{meta.pilot}</dd>
              </>
            )}
            <dt>Date</dt>
            <dd>
              {formatDate(stats.start, tz)} {formatClock(stats.start, tz)}{" "}
              <span className="muted">{tzLabel}</span>
            </dd>
            {meta.site && (
              <>
                <dt>Launch</dt>
                <dd>{meta.site}</dd>
              </>
            )}
            {meta.gliderType && (
              <>
                <dt>Glider</dt>
                <dd>{meta.gliderType}</dd>
              </>
            )}
            <dt>Wind</dt>
            <dd>
              <WindBadge wind={stats.wind} fmt={fmt} />
            </dd>
          </dl>
        </div>

        <div className="stat-grid">
          {stat("Airtime", formatDuration(stats.airtime, true))}
          {stat("Max altitude", fmt.altitude(stats.maxAlt))}
          {stat("Max alt. gain", fmt.altitude(stats.maxAltGain))}
          {stat("Max climb", fmt.vario(stats.maxClimb), "sustained 30 s")}
          {stat("Max sink", fmt.vario(-stats.maxSink), "sustained 30 s")}
          {stat("Track length", fmt.distance(stats.trackLength))}
          {stat("Straight dist.", fmt.distance(stats.straightDistance), "takeoff → landing")}
          {stat("Free distance", fmt.distance(stats.freeDistance), "up to 3 turnpoints")}
          {stat("Avg ground speed", fmt.speed(stats.avgSpeed))}
        </div>
      </div>
    </section>
  );
}
