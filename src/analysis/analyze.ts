import type { Flight, ParsedTrack } from "../types";
import { computeDerived } from "./derive";
import { detectPhases } from "./phases";
import { computeStats, detectActiveRange } from "./stats";

/** Run the full analysis pipeline on a parsed track. */
export function analyzeFlight(parsed: ParsedTrack): Flight {
  const { fixes, meta } = parsed;
  const derived = computeDerived(fixes);
  const [start, end] = detectActiveRange(derived);
  const { thermals, badTurns, glides, phases } = detectPhases(
    fixes, derived, start, end,
  );
  const stats = computeStats(fixes, derived, start, end, thermals);

  return {
    meta, fixes, derived, stats,
    thermals, badTurns, glides, phases,
    range: [start, end],
  };
}
