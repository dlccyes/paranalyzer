// Core domain types shared across parsers, analysis and UI.

/** A single GPS fix from a track log. */
export interface Fix {
  /** Absolute time in epoch milliseconds. */
  time: number;
  lat: number;
  lon: number;
  /** GPS (geometric) altitude in metres. */
  alt: number;
  /** Barometric / pressure altitude in metres, when present in the source. */
  pressureAlt?: number;
}

/** Metadata pulled from the file header (best-effort, source dependent). */
export interface FlightMeta {
  pilot?: string;
  gliderType?: string;
  site?: string;
  /** Original file name as uploaded. */
  fileName?: string;
  /** Source format. */
  source: "igc" | "gpx" | "kml";
  /** Timezone offset in minutes for display, if derivable; otherwise UTC. */
  tzOffsetMinutes?: number;
}

/** A parsed track before analysis. */
export interface ParsedTrack {
  meta: FlightMeta;
  fixes: Fix[];
}

/**
 * Per-fix derived quantities, index-aligned with {@link Flight.fixes}.
 * Pre-computing these once keeps the detectors and charts simple.
 */
export interface Derived {
  /** Seconds elapsed since the first fix. */
  t: number[];
  /** Time delta to the previous fix, in seconds (dt[0] = 0). */
  dt: number[];
  /** Cumulative along-track 2D distance in metres. */
  cumDist: number[];
  /** Ground speed in m/s (centred difference where possible). */
  groundSpeed: number[];
  /** Instantaneous course over ground in degrees [0,360). */
  bearing: number[];
  /** Signed turn rate in deg/s (+ = clockwise / right). */
  turnRate: number[];
  /** Smoothed vertical speed in m/s (+ = climb). */
  vario: number[];
  /** East velocity component in m/s. */
  ve: number[];
  /** North velocity component in m/s. */
  vn: number[];
}

export type PhaseKind = "thermal" | "glide" | "badturn";

interface PhaseBase {
  kind: PhaseKind;
  /** Inclusive start/end indices into the fix array. */
  startIdx: number;
  endIdx: number;
  startTime: number;
  endTime: number;
  /** Duration in seconds. */
  duration: number;
  /** Altitude at start / end in metres. */
  startAlt: number;
  endAlt: number;
  /** Net altitude change in metres (+ = gain). */
  altChange: number;
  /** Along-track distance covered in metres. */
  trackDistance: number;
  /** Straight-line distance start→end in metres. */
  straightDistance: number;
}

export interface Thermal extends PhaseBase {
  kind: "thermal";
  /** Number of full 360° turns (can be fractional). */
  turns: number;
  /** Net climb in metres (== altChange, kept for clarity). */
  climb: number;
  /** Average climb rate over the thermal, m/s. */
  climbRate: number;
  /** Average circling radius in metres. */
  avgRadius: number;
  /** +1 clockwise (right), -1 counter-clockwise (left). */
  direction: 1 | -1;
  /** Wind estimated from this thermal's circles. */
  wind: WindEstimate | null;
}

/**
 * A "bad turn": more than one full 360° turn while NOT climbing — i.e. circling
 * that burns altitude/time without gaining. Same shape as a thermal but the
 * altitude change ({@link PhaseBase.altChange}) is zero or negative.
 */
export interface BadTurn extends PhaseBase {
  kind: "badturn";
  turns: number;
  /** Average vertical rate over the segment, m/s (≤ climb threshold). */
  climbRate: number;
  avgRadius: number;
  direction: 1 | -1;
  wind: WindEstimate | null;
}

export interface Glide extends PhaseBase {
  kind: "glide";
  /** Overall course start→end in degrees [0,360). */
  course: number;
  /** Average ground speed in m/s (trackDistance / duration). */
  groundSpeed: number;
  /** Altitude lost over the glide in metres (negative if the glide climbed). */
  totalSink: number;
  /** Average sink rate in m/s: positive = sinking, negative = climbing. */
  avgSinkRate: number;
  /**
   * Ground glide ratio = horizontal track distance / altitude lost.
   * Null when the segment gained altitude overall (no meaningful glide).
   */
  glideRatio: number | null;
  /** Wind from the nearest thermal in time, if any. */
  wind: WindEstimate | null;
}

export type Phase = Thermal | Glide | BadTurn;
export type AnyPhase = Phase | RidgeSoar;

/** Estimated wind, meteorological convention (direction wind blows FROM). */
export interface WindEstimate {
  /** Wind speed in m/s. */
  speed: number;
  /** Direction the wind comes FROM, degrees [0,360). */
  fromDeg: number;
}

/**
 * A detected ridge / slope soaring segment: non-circling flight that maintains
 * altitude, typically back-and-forth along a slope. Additive — does not
 * overlap with or replace thermals/glides.
 */
export interface RidgeSoar {
  kind: "ridge";
  startIdx: number;
  endIdx: number;
  startTime: number;
  endTime: number;
  /** Duration in seconds. */
  duration: number;
  startAlt: number;
  endAlt: number;
  altChange: number;
  trackDistance: number;
  /** Number of back-and-forth heading reversals detected. */
  passes: number;
  /** Mean altitude over the run, metres. */
  avgAlt: number;
}

/** XContest score computed by the official igc-xc-score library. */
export interface XcScore {
  points: number;
  distanceM: number;
  type: string;
}

/** Whole-flight summary statistics (all SI units). */
export interface FlightStats {
  start: number;
  end: number;
  /** Airtime in seconds (takeoff → landing). */
  airtime: number;
  maxAlt: number;
  minAlt: number;
  /** Largest altitude gain from any prior low point, metres. */
  maxAltGain: number;
  maxClimb: number;
  /** Most negative vertical speed (reported as a positive sink value), m/s. */
  maxSink: number;
  /** Total along-track length, metres. */
  trackLength: number;
  /** Straight-line distance takeoff → landing, metres. */
  straightDistance: number;
  /** Open ("free") distance via up to 3 turnpoints, metres. */
  freeDistance: number;
  /** Average ground speed over airtime, m/s. */
  avgSpeed: number;
  /** Overall wind estimate from all thermals, if any. */
  wind: WindEstimate | null;
  /** Total seconds spent in thermals. */
  timeInThermal: number;
  /** Total seconds spent in detected ridge / slope soaring. */
  timeInRidge: number;
  /** XContest score computed by the official World XContest algorithm. */
  xcScore: XcScore;
}

/** Fully analysed flight, the central object the UI renders from. */
export interface Flight {
  meta: FlightMeta;
  fixes: Fix[];
  derived: Derived;
  stats: FlightStats;
  thermals: Thermal[];
  glides: Glide[];
  /** Circling that wastes height/time (>1 turn, not climbing). */
  badTurns: BadTurn[];
  /** All phases interleaved in chronological order. */
  phases: Phase[];
  /** Airborne range [takeoff, landing] as inclusive fix indices. */
  range: [number, number];
  /** Detected ridge / slope soaring segments. */
  ridgeSoars: RidgeSoar[];
}
