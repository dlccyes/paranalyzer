import type { Fix, ParsedTrack } from "../types";

/** Parse a GPX 1.1 track (`<trkpt lat lon><ele/><time/>`). */
export function parseGPX(text: string, fileName?: string): ParsedTrack {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.querySelector("parsererror")) {
    throw new Error("Invalid GPX: the file is not well-formed XML.");
  }

  const fixes: Fix[] = [];
  const pts = doc.getElementsByTagName("trkpt");
  for (let i = 0; i < pts.length; i++) {
    const pt = pts[i];
    const lat = parseFloat(pt.getAttribute("lat") ?? "");
    const lon = parseFloat(pt.getAttribute("lon") ?? "");
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    const eleEl = pt.getElementsByTagName("ele")[0];
    const timeEl = pt.getElementsByTagName("time")[0];
    const alt = eleEl ? parseFloat(eleEl.textContent ?? "") : NaN;
    const time = timeEl ? Date.parse(timeEl.textContent ?? "") : NaN;

    fixes.push({
      time: Number.isFinite(time) ? time : i * 1000,
      lat,
      lon,
      alt: Number.isFinite(alt) ? alt : 0,
    });
  }

  if (!fixes.length) {
    throw new Error("No <trkpt> track points found in the GPX file.");
  }

  const pilot =
    text.match(/<name>([^<]+)<\/name>/)?.[1]?.trim() || undefined;

  return {
    meta: { source: "gpx", fileName, pilot },
    fixes,
  };
}
