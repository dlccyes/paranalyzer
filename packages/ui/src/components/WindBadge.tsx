import type { WindEstimate } from "@paranalyzer/core";
import { compassName } from "@paranalyzer/core";
import type { UnitFormatter } from "@paranalyzer/core";
import { Arrow } from "./Arrow";

interface Props {
  wind: WindEstimate | null;
  fmt: UnitFormatter;
  size?: number;
  showLabel?: boolean;
}

export function WindBadge({ wind, fmt, size = 22, showLabel = true }: Props) {
  if (!wind) {
    return <span className="wind-badge muted">—</span>;
  }
  return (
    <span className="wind-badge">
      <Arrow deg={wind.fromDeg} size={size} title={`Wind from ${Math.round(wind.fromDeg)}°`} />
      {showLabel && (
        <span className="wind-label">
          {compassName(wind.fromDeg)} {Math.round(wind.fromDeg)}° · {fmt.speed(wind.speed)}
        </span>
      )}
    </span>
  );
}
