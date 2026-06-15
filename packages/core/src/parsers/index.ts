import type { ParsedTrack } from "../types";
import { parseIGC } from "./igc";
import { parseGPX } from "./gpx";
import { parseKML } from "./kml";

export type SupportedFormat = "igc" | "gpx" | "kml";

/** Detect the format from the file extension, then sniff content as a fallback. */
export function detectFormat(fileName: string, text: string): SupportedFormat {
  const ext = fileName.toLowerCase().split(".").pop();
  if (ext === "igc" || ext === "gpx" || ext === "kml") return ext;
  const head = text.slice(0, 2000);
  if (/^A[A-Z0-9]{3}/m.test(head) || /^B\d{6}/m.test(head)) return "igc";
  if (/<gpx[\s>]/i.test(head)) return "gpx";
  if (/<kml[\s>]/i.test(head)) return "kml";
  throw new Error(
    "Unrecognised file. Please upload an .igc, .gpx, or .kml track.",
  );
}

/** Parse a track file of any supported format and normalise the fixes. */
export function parseTrack(fileName: string, text: string): ParsedTrack {
  const format = detectFormat(fileName, text);
  const parsed =
    format === "igc"
      ? parseIGC(text, fileName)
      : format === "gpx"
        ? parseGPX(text, fileName)
        : parseKML(text, fileName);

  parsed.fixes = cleanFixes(parsed.fixes);
  if (parsed.fixes.length < 2) {
    throw new Error("The track has too few valid GPS fixes to analyse.");
  }
  return parsed;
}

function cleanFixes(fixes: ParsedTrack["fixes"]): ParsedTrack["fixes"] {
  const sorted = [...fixes].sort((a, b) => a.time - b.time);
  const out: typeof sorted = [];
  for (const f of sorted) {
    const prev = out[out.length - 1];
    if (prev && f.time - prev.time < 1) continue;
    out.push(f);
  }
  return out;
}
