import { analyzeFlight, type Flight, type ParsedTrack } from "@paranalyzer/core";
import { getSettings } from "./db";
import { analyzeOptions, type Settings } from "./model";

/**
 * The single entry point for analyzing a flight in the app. Always applies the
 * user's configured thresholds (thermal / ridge) so no code path can silently
 * fall back to the core library defaults.
 *
 * Pass a preloaded `settings` to avoid a repeat read (e.g. inside a recalc
 * loop); otherwise the current settings are loaded.
 */
export async function analyzeWithSettings(
  parsed: ParsedTrack,
  settings?: Settings,
): Promise<Flight> {
  const cfg = settings ?? (await getSettings());
  return analyzeFlight(parsed, analyzeOptions(cfg));
}
