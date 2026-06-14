import type { WindEstimate } from "../types";
import { compassName } from "../analysis/geo";
import type { UnitFormatter } from "../units";
import { Arrow } from "./Arrow";

interface Props {
  wind: WindEstimate | null;
  fmt: UnitFormatter;
  /** Arrow size in px. */
  size?: number;
  /** Show the textual label next to the arrow. */
  showLabel?: boolean;
}

/**
 * Wind direction arrow + label. The arrow points toward the source (the
 * meteorological "from" direction), matching the textual label.
 */
export function WindBadge({ wind, fmt, size = 22, showLabel = true }: Props) {
  if (!wind) {
    return <span className="wind-badge muted">—</span>;
  }
  return (
    <span className="wind-badge">
      <Arrow deg={wind.fromDeg} size={size} title={`Wind from ${Math.round(wind.fromDeg)}°`} />
      {showLabel && (
        <span className="wind-label">
          {compassName(wind.fromDeg)} {Math.round(wind.fromDeg)}° ·{" "}
          {fmt.speed(wind.speed)}
        </span>
      )}
    </span>
  );
}
