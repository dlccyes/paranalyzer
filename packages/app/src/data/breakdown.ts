import type { FlightRecord } from "./model";
import { SITE_PALETTE, SITE_OTHER_COLOR } from "@paranalyzer/core";

export type SiteMetric = "airtime" | "thermal" | "ridge" | "glide" | "other";

export interface SiteSegment {
  site: string;
  label: string;
  value: number;
  color: string;
}

const MAX_SLICES = 8;

function metricValue(rec: FlightRecord, metric: SiteMetric): number {
  switch (metric) {
    case "airtime": return rec.airtime;
    case "thermal": return rec.timeInThermal;
    case "ridge": return rec.timeInRidge;
    case "glide": return rec.timeInGlide ?? 0;
    case "other": return Math.max(0, rec.airtime - rec.timeInThermal - rec.timeInRidge - (rec.timeInGlide ?? 0));
  }
}

export function siteBreakdown(flights: FlightRecord[], metric: SiteMetric): SiteSegment[] {
  const totals = new Map<string, number>();
  for (const rec of flights) {
    const key = rec.site?.trim() || "";
    totals.set(key, (totals.get(key) ?? 0) + metricValue(rec, metric));
  }

  // Sort sites by name so colour assignments are stable across re-renders
  const sortedSites = [...totals.keys()].filter((s) => s !== "").sort();
  const noSiteVal = totals.get("") ?? 0;

  // Assign colours to named sites
  const coloured: SiteSegment[] = sortedSites
    .map((site, i) => ({
      site,
      label: site,
      value: totals.get(site) ?? 0,
      color: SITE_PALETTE[i % SITE_PALETTE.length],
    }))
    .filter((s) => s.value > 0)
    .sort((a, b) => b.value - a.value);

  // Cap at MAX_SLICES — fold excess into "Other"
  let result: SiteSegment[];
  if (coloured.length > MAX_SLICES) {
    const top = coloured.slice(0, MAX_SLICES);
    const restVal = coloured.slice(MAX_SLICES).reduce((s, x) => s + x.value, 0) + noSiteVal;
    result = top;
    if (restVal > 0) result = [...top, { site: "", label: "Other", value: restVal, color: SITE_OTHER_COLOR }];
  } else {
    result = coloured;
    if (noSiteVal > 0) result = [...coloured, { site: "", label: "No site", value: noSiteVal, color: SITE_OTHER_COLOR }];
  }

  return result;
}
