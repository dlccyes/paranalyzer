import { useState } from "react";

export interface DonutSegment {
  key: string;
  label: string;
  value: number;
  color: string;
}

interface Props {
  segments: DonutSegment[];
  total: number;
  formatValue: (n: number) => string;
  centerLabel: string;
  /** Persistent selected-segment key (e.g. active filter or active metric). */
  activeKey?: string | null;
  /** Called when the user clicks a segment. */
  onSegmentClick?: (key: string) => void;
}

export function DonutBreakdown({
  segments,
  total,
  formatValue,
  centerLabel,
  activeKey,
  onSegmentClick,
}: Props) {
  const [hoverKey, setHoverKey] = useState<string | null>(null);

  // Hover takes priority over persistent selection for the center readout
  const displayKey = hoverKey ?? activeKey ?? null;
  const displaySeg = segments.find((s) => s.key === displayKey) ?? null;
  const centerValue = displaySeg ? displaySeg.value : total;
  const centerPct = displaySeg && total > 0 ? Math.round((displaySeg.value / total) * 100) : null;

  const circumference = 2 * Math.PI * 46;
  let offset = 0;

  return (
    <div className="time-breakdown">
      {activeKey && onSegmentClick && (
        <button
          type="button"
          className="donut-clear"
          onClick={() => onSegmentClick(activeKey)}
          aria-label="Clear selection"
          title="Clear selection"
        >
          ✕ Clear
        </button>
      )}
      <div className="time-pie-wrap" aria-label={centerLabel}>
        <svg className="time-pie" viewBox="0 0 120 120" role="img">
          <circle className="time-pie-base" cx="60" cy="60" r="46" />
          {segments.map((seg) => {
            const length = total > 0 ? (seg.value / total) * circumference : 0;
            const dashOffset = -offset;
            const isHighlighted = displayKey === seg.key;
            const isMuted = displayKey != null && !isHighlighted;
            const activeClass = isHighlighted ? " is-active" : isMuted ? " is-muted" : "";
            offset += length;
            return (
              <circle
                key={seg.key}
                className={`time-pie-segment${activeClass}`}
                cx="60"
                cy="60"
                r="46"
                stroke={seg.color}
                strokeDasharray={`${length} ${circumference - length}`}
                strokeDashoffset={dashOffset}
                tabIndex={0}
                role="button"
                aria-label={`${seg.label}: ${formatValue(seg.value)}`}
                aria-pressed={activeKey === seg.key}
                onFocus={() => setHoverKey(seg.key)}
                onBlur={() => setHoverKey(null)}
                onMouseEnter={() => setHoverKey(seg.key)}
                onMouseLeave={() => setHoverKey(null)}
                onPointerEnter={() => setHoverKey(seg.key)}
                onPointerLeave={() => setHoverKey(null)}
                onClick={() => onSegmentClick?.(seg.key)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSegmentClick?.(seg.key);
                  }
                }}
              >
                <title>{`${seg.label}: ${formatValue(seg.value)}`}</title>
              </circle>
            );
          })}
          <text className="time-pie-total" x="60" y="54">{formatValue(centerValue)}</text>
          <text className="time-pie-label" x="60" y="69">{displaySeg ? displaySeg.label : centerLabel}</text>
          {centerPct != null && <text className="time-pie-percent" x="60" y="83">{centerPct}%</text>}
        </svg>
      </div>
      <div className="time-breakdown-legend" role="list">
        {segments.map((seg) => {
          const pct = total > 0 ? Math.round((seg.value / total) * 100) : 0;
          const isHighlighted = displayKey === seg.key;
          return (
            <div
              className={`time-breakdown-row${isHighlighted ? " is-active" : ""}${onSegmentClick ? " is-clickable" : ""}`}
              key={seg.key}
              role="listitem"
              tabIndex={0}
              onFocus={() => setHoverKey(seg.key)}
              onBlur={() => setHoverKey(null)}
              onMouseEnter={() => setHoverKey(seg.key)}
              onMouseLeave={() => setHoverKey(null)}
              onPointerEnter={() => setHoverKey(seg.key)}
              onPointerLeave={() => setHoverKey(null)}
              onClick={() => onSegmentClick?.(seg.key)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSegmentClick?.(seg.key);
                }
              }}
            >
              <span className="time-dot" style={{ background: seg.color }} />
              <span className="time-label">{seg.label}</span>
              <span className="time-value">{formatValue(seg.value)}</span>
              <span className="time-percent">{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
