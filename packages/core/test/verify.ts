// Dev utility: parse + analyze the bundled sample and print stats.
// Run with:  npx tsx test/verify.ts  (from packages/core/)
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseTrack } from "../src/parsers/index.ts";
import { analyzeFlight } from "../src/analysis/analyze.ts";
import { compassName } from "../src/analysis/geo.ts";
import { formatDuration, formatTzOffset } from "../src/units.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const samplePath = join(__dirname, "../sample/sample-woodrat.igc");
const text = readFileSync(samplePath, "utf8");
const parsed = parseTrack("sample-woodrat.igc", text);
const f = analyzeFlight(parsed);

const km = (m: number) => (m / 1000).toFixed(3) + " km";
const ms = (v: number) => v.toFixed(2) + " m/s";

console.log("=== META ===");
console.log("pilot:", f.meta.pilot);
console.log("glider:", f.meta.gliderType);
console.log("site:", f.meta.site);
console.log("tz:", f.meta.tzOffsetMinutes != null ? formatTzOffset(f.meta.tzOffsetMinutes) : "UTC");
console.log("fixes:", f.fixes.length);

console.log("\n=== STATS (expected from XContest in parens) ===");
console.log("airtime:", formatDuration(f.stats.airtime, true), "(1:21:46)");
console.log("max alt:", f.stats.maxAlt.toFixed(0), "m (1853 m)");
console.log("max alt gain:", f.stats.maxAltGain.toFixed(0), "m (1029 m)");
console.log("max climb:", ms(f.stats.maxClimb), "(1.6 m/s)");
console.log("max sink:", ms(-f.stats.maxSink), "(-2.7 m/s)");
console.log("track length:", km(f.stats.trackLength), "(37.413 km)");
console.log("straight dist:", km(f.stats.straightDistance));
console.log("free distance:", km(f.stats.freeDistance), "(~14.09 km)");
console.log("avg speed:", (f.stats.avgSpeed * 3.6).toFixed(2), "km/h (8.93 km/h)");
console.log("time in thermal:", formatDuration(f.stats.timeInThermal));
console.log("time in ridge:", formatDuration(f.stats.timeInRidge));
if (f.stats.wind) {
  console.log(
    "wind:",
    (f.stats.wind.speed * 3.6).toFixed(1), "km/h from",
    f.stats.wind.fromDeg.toFixed(0) + "°", compassName(f.stats.wind.fromDeg),
  );
}

console.log(`\n=== THERMALS (${f.thermals.length}) ===`);
for (const [i, t] of f.thermals.entries()) {
  console.log(
    `#${i + 1}  ${formatDuration(t.duration)}  turns=${t.turns.toFixed(1)} ${t.direction === 1 ? "R" : "L"}` +
    `  climb=${t.climb.toFixed(0)}m @ ${ms(t.climbRate)}  r=${t.avgRadius.toFixed(0)}m` +
    `  wind=${t.wind ? (t.wind.speed * 3.6).toFixed(0) + "km/h@" + t.wind.fromDeg.toFixed(0) : "n/a"}`,
  );
}

console.log(`\n=== RIDGE SOARS (${f.ridgeSoars.length}) ===`);
for (const [i, r] of f.ridgeSoars.entries()) {
  console.log(
    `#${i + 1}  ${formatDuration(r.duration)}  passes=${r.passes}  avgAlt=${r.avgAlt.toFixed(0)}m  dist=${km(r.trackDistance)}`,
  );
}

console.log(`\n=== BAD TURNS (${f.badTurns.length}) ===`);
for (const [i, t] of f.badTurns.entries()) {
  console.log(
    `#${i + 1}  ${formatDuration(t.duration)}  turns=${t.turns.toFixed(1)} ${t.direction === 1 ? "R" : "L"}` +
    `  alt=${t.altChange.toFixed(0)}m @ ${ms(t.climbRate)}`,
  );
}

console.log(`\n=== GLIDES (${f.glides.length}) ===`);
for (const [i, g] of f.glides.entries()) {
  console.log(
    `#${i + 1}  ${formatDuration(g.duration)}  ${compassName(g.course)} ${g.course.toFixed(0)}°` +
    `  ${km(g.trackDistance)}  gs=${(g.groundSpeed * 3.6).toFixed(1)}km/h` +
    `  sink=${g.totalSink.toFixed(0)}m @ ${ms(g.avgSinkRate)}  GR=${g.glideRatio ? g.glideRatio.toFixed(1) : "—"}`,
  );
}

// Regression assertions (throw if broken).
console.log("\n=== REGRESSION CHECK ===");
function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`PASS: ${msg}`);
}
assert(f.thermals.length > 0, "thermals detected");
assert(Math.abs(f.stats.airtime - 4888) < 120, `airtime ~4888s (got ${f.stats.airtime.toFixed(0)})`);
assert(Math.abs(f.stats.maxAlt - 1853) < 10, `maxAlt ~1853m (got ${f.stats.maxAlt.toFixed(0)})`);
assert(f.stats.trackLength > 36000, `trackLength >36km (got ${km(f.stats.trackLength)})`);
assert(f.stats.timeInThermal > 0, "timeInThermal > 0");
console.log("\nAll checks passed.");
