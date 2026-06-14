import type { Fix, ParsedTrack } from "../types";

/**
 * Parse a KML track. Supports both the Google Earth `<gx:Track>` form
 * (paired `<when>` + `<gx:coord>`) and a plain `<LineString><coordinates>`
 * (no timestamps — fixes get synthetic 1 Hz times).
 */
export function parseKML(text: string, fileName?: string): ParsedTrack {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.querySelector("parsererror")) {
    throw new Error("Invalid KML: the file is not well-formed XML.");
  }

  const fixes: Fix[] = [];

  // Preferred: gx:Track with time-stamped coordinates.
  const tracks = getByLocal(doc, "Track");
  for (const track of tracks) {
    const whens = getByLocal(track, "when");
    const coords = getByLocal(track, "coord");
    const n = Math.min(whens.length, coords.length);
    for (let i = 0; i < n; i++) {
      const time = Date.parse(whens[i].textContent ?? "");
      const parts = (coords[i].textContent ?? "").trim().split(/\s+/).map(Number);
      const [lon, lat, alt] = parts;
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      fixes.push({
        time: Number.isFinite(time) ? time : i * 1000,
        lat,
        lon,
        alt: Number.isFinite(alt) ? alt : 0,
      });
    }
  }

  // Fallback: a LineString's coordinate list (lon,lat,alt tuples).
  if (!fixes.length) {
    const lineStrings = getByLocal(doc, "coordinates");
    let i = 0;
    for (const node of lineStrings) {
      const tuples = (node.textContent ?? "").trim().split(/\s+/);
      for (const tuple of tuples) {
        const [lon, lat, alt] = tuple.split(",").map(Number);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
        fixes.push({ time: i++ * 1000, lat, lon, alt: Number.isFinite(alt) ? alt : 0 });
      }
    }
  }

  if (!fixes.length) {
    throw new Error("No track coordinates found in the KML file.");
  }

  const pilot = getByLocal(doc, "name")[0]?.textContent?.trim() || undefined;

  return {
    meta: { source: "kml", fileName, pilot },
    fixes,
  };
}

/** Get descendants by local tag name, ignoring XML namespace prefixes. */
function getByLocal(root: Document | Element, local: string): Element[] {
  const out: Element[] = [];
  const all = root.getElementsByTagName("*");
  for (let i = 0; i < all.length; i++) {
    if (all[i].localName === local) out.push(all[i]);
  }
  return out;
}
