import type { Flight, ParsedTrack } from "../types";
import { computeDerived } from "./derive";
import { detectPhases } from "./phases";
import { computeStats, detectActiveRange } from "./stats";
import { detectRidgeSoaring } from "./ridge";

/** Run the full analysis pipeline on a parsed track. */
export function analyzeFlight(parsed: ParsedTrack): Flight {
  const { fixes, meta } = parsed;
  const derived = computeDerived(fixes);
  const [start, end] = detectActiveRange(derived);
  const { thermals, badTurns, glides, phases } = detectPhases(fixes, derived, start, end);

  const circlingIntervals = [...thermals, ...badTurns].map(
    (p): [number, number] => [p.startIdx, p.endIdx],
  );
  const ridgeSoars = detectRidgeSoaring(fixes, derived, start, end, circlingIntervals);

  const stats = computeStats(fixes, derived, start, end, thermals, ridgeSoars);

  return {
    meta, fixes, derived, stats,
    thermals, badTurns, glides, phases,
    range: [start, end],
    ridgeSoars,
  };
}
