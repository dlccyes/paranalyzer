import { formatDurationHM, PHASE_COLORS } from "@paranalyzer/core";

export interface TimeBreakdown {
  airtime: number;
  thermal: number;
  glide: number;
  ridge: number;
}

interface Props {
  breakdown: TimeBreakdown;
}

const OTHER_COLOR = "#6b7488";

export function TimeBreakdownChart({ breakdown }: Props) {
  const total = Math.max(0, breakdown.airtime);
  const values = [
    { key: "thermal", label: "Thermal", value: Math.max(0, breakdown.thermal), color: PHASE_COLORS.thermal },
    { key: "ridge", label: "Ridge soaring", value: Math.max(0, breakdown.ridge), color: PHASE_COLORS.ridge },
    { key: "glide", label: "Glide", value: Math.max(0, breakdown.glide), color: PHASE_COLORS.glide },
    {
      key: "other",
      label: "Other",
      value: Math.max(0, total - breakdown.thermal - breakdown.ridge - breakdown.glide),
      color: OTHER_COLOR,
    },
  ].filter((item) => item.value > 0);

  const circumference = 2 * Math.PI * 46;
  let offset = 0;

  return (
    <div className="time-breakdown">
      <div className="time-pie-wrap" aria-label="Time breakdown">
        <svg className="time-pie" viewBox="0 0 120 120" role="img">
          <circle className="time-pie-base" cx="60" cy="60" r="46" />
          {values.map((item) => {
            const length = total > 0 ? (item.value / total) * circumference : 0;
            const dashOffset = -offset;
            offset += length;
            return (
              <circle
                key={item.key}
                className="time-pie-segment"
                cx="60"
                cy="60"
                r="46"
                stroke={item.color}
                strokeDasharray={`${length} ${circumference - length}`}
                strokeDashoffset={dashOffset}
              />
            );
          })}
          <text className="time-pie-total" x="60" y="56">{formatDurationHM(total)}</text>
          <text className="time-pie-label" x="60" y="72">airtime</text>
        </svg>
      </div>
      <div className="time-breakdown-legend">
        {values.map((item) => {
          const pct = total > 0 ? Math.round((item.value / total) * 100) : 0;
          return (
            <div className="time-breakdown-row" key={item.key}>
              <span className="time-dot" style={{ background: item.color }} />
              <span className="time-label">{item.label}</span>
              <span className="time-value">{formatDurationHM(item.value)}</span>
              <span className="time-percent">{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
