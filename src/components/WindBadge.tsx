import type { WindEstimate } from "../types";
import { compassName } from "../analysis/geo";
import type { UnitFormatter } from "../units";

interface Props {
  wind: WindEstimate | null;
  fmt: UnitFormatter;
  /** Arrow size in px. */
  size?: number;
  /** Show the textual label next to the arrow. */
  showLabel?: boolean;
}

/**
 * Wind direction arrow + label. The arrow points the way the air is moving
 * (downwind); the label states the meteorological "from" direction and speed.
 */
export function WindBadge({ wind, fmt, size = 22, showLabel = true }: Props) {
  if (!wind) {
    return <span className="wind-badge muted">—</span>;
  }
  // Arrow points downwind = the direction the air travels toward.
  const towardDeg = (wind.fromDeg + 180) % 360;
  return (
    <span className="wind-badge" title={`Wind from ${Math.round(wind.fromDeg)}°`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        style={{ transform: `rotate(${towardDeg}deg)` }}
        aria-hidden="true"
      >
        <path
          d="M12 2 L12 20 M12 20 L7 14 M12 20 L17 14"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
      {showLabel && (
        <span className="wind-label">
          {compassName(wind.fromDeg)} {Math.round(wind.fromDeg)}° ·{" "}
          {fmt.speed(wind.speed)}
        </span>
      )}
    </span>
  );
}
