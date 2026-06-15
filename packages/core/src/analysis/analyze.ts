import type { Flight, ParsedTrack } from "../types";
import { computeDerived } from "./derive";
import { detectCircling, detectGlides } from "./phases";
import { computeStats, detectActiveRange } from "./stats";
import { detectRidgeSoaring } from "./ridge";

/** Tunable knobs for the analysis pipeline. */
export interface AnalyzeOptions {
  /** Bridge ridge runs separated by less than this many seconds. */
  ridgeBridgeGapSec?: number;
  /** Bridge thermal/circling runs separated by this many seconds or less. */
  thermalBridgeGapSec?: number;
  /** Minimum number of turns for a climbing circling run to count as a thermal. */
  thermalMinTurns?: number;
}

/** Run the full analysis pipeline on a parsed track. */
export function analyzeFlight(parsed: ParsedTrack, opts: AnalyzeOptions = {}): Flight {
  const { fixes, meta } = parsed;
  const derived = computeDerived(fixes);
  const [start, end] = detectActiveRange(derived);

  // Pass 1: circling (thermals + bad turns)
  const { thermals, badTurns, significantIntervals } =
    detectCircling(fixes, derived, start, end, opts.thermalMinTurns, opts.thermalBridgeGapSec);

  // Pass 2: ridge soaring — excludes all circling intervals
  const ridgeSoars = detectRidgeSoaring(
    fixes, derived, start, end, significantIntervals, opts.ridgeBridgeGapSec,
  );
  const ridgeIntervals: [number, number][] = ridgeSoars.map((r) => [r.startIdx, r.endIdx]);

  // Pass 3: glides — fill gaps not claimed by circling or ridge
  const glides = detectGlides(
    fixes, derived, start, end,
    [...significantIntervals, ...ridgeIntervals],
    thermals,
  );

  const phases = [...thermals, ...badTurns, ...glides].sort((a, b) => a.startIdx - b.startIdx);
  const stats = computeStats(fixes, derived, start, end, thermals, glides, ridgeSoars);

  return {
    meta, fixes, derived, stats,
    thermals, badTurns, glides, phases,
    range: [start, end],
    ridgeSoars,
  };
}
