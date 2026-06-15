import { formatDurationHM } from "@paranalyzer/core";
import { DonutBreakdown, type DonutSegment } from "./DonutBreakdown";

export type { DonutSegment as SiteSegment };

export interface SiteDataEntry {
  site: string;
  label: string;
  value: number;
  color: string;
}

const METRIC_LABELS: Record<string, string> = {
  airtime: "by site",
  thermal: "thermal · by site",
  ridge: "ridge · by site",
  glide: "glide · by site",
  other: "other · by site",
};

interface Props {
  data: SiteDataEntry[];
  metric?: string;
  activeKey?: string | null;
  onSegmentClick?: (site: string) => void;
}

export function SiteBreakdownChart({ data, metric = "airtime", activeKey, onSegmentClick }: Props) {
  const segments: DonutSegment[] = data.map((d) => ({
    key: d.site,
    label: d.label,
    value: d.value,
    color: d.color,
  }));
  const total = segments.reduce((s, x) => s + x.value, 0);
  const centerLabel = METRIC_LABELS[metric] ?? "by site";

  const handleClick = (key: string) => {
    // "No site" (empty key) is not filterable in v1
    if (key !== "") onSegmentClick?.(key);
  };

  return (
    <DonutBreakdown
      segments={segments}
      total={total}
      formatValue={formatDurationHM}
      centerLabel={centerLabel}
      activeKey={activeKey}
      onSegmentClick={handleClick}
    />
  );
}
