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

  // Remove glides that substantially overlap a ridge soaring span (>30% by time)
  // so ridge flight isn't double-counted as a glide.
  const filteredGlides = glides.filter((g) =>
    !ridgeSoars.some((r) => {
      const oa = Math.max(g.startIdx, r.startIdx);
      const ob = Math.min(g.endIdx, r.endIdx);
      if (ob <= oa) return false;
      const overlapSec = derived.t[ob] - derived.t[oa];
      const glideSec = derived.t[g.endIdx] - derived.t[g.startIdx];
      return glideSec > 0 && overlapSec / glideSec > 0.3;
    }),
  );

  const stats = computeStats(fixes, derived, start, end, thermals, ridgeSoars);

  return {
    meta, fixes, derived, stats,
    thermals, badTurns, glides: filteredGlides, phases,
    range: [start, end],
    ridgeSoars,
  };
}
