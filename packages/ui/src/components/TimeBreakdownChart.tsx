import { formatDurationHM, PHASE_COLORS } from "@paranalyzer/core";
import { DonutBreakdown, type DonutSegment } from "./DonutBreakdown";

export interface TimeBreakdown {
  airtime: number;
  thermal: number;
  glide: number;
  ridge: number;
}

interface Props {
  breakdown: TimeBreakdown;
  activeKey?: string | null;
  onSegmentClick?: (key: string) => void;
}

const OTHER_COLOR = "#6b7488";

export function TimeBreakdownChart({ breakdown, activeKey, onSegmentClick }: Props) {
  const total = Math.max(0, breakdown.airtime);
  const segments: DonutSegment[] = [
    { key: "thermal", label: "Thermal", value: Math.max(0, breakdown.thermal), color: PHASE_COLORS.thermal },
    { key: "ridge", label: "Ridge soaring", value: Math.max(0, breakdown.ridge), color: PHASE_COLORS.ridge },
    { key: "glide", label: "Glide", value: Math.max(0, breakdown.glide), color: PHASE_COLORS.glide },
    {
      key: "other",
      label: "Other",
      value: Math.max(0, total - breakdown.thermal - breakdown.ridge - breakdown.glide),
      color: OTHER_COLOR,
    },
  ]
    .filter((s) => s.value > 0)
    .sort((a, b) => b.value - a.value);

  return (
    <DonutBreakdown
      segments={segments}
      total={total}
      formatValue={formatDurationHM}
      centerLabel="airtime"
      activeKey={activeKey}
      onSegmentClick={onSegmentClick}
    />
  );
}
