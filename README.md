# 🪂 Paranalyzer

A **pure-frontend** paragliding flight analyzer for `.igc`, `.gpx`, and `.kml`
tracks. Drop in a flight and get an XContest-style breakdown — thermals, glides,
wind, and an interactive map + barogram — all computed **in your browser**. No
upload, no backend, your track never leaves your device.

> Metric/imperial · interactive map coloured by climb/sink · barogram · thermal &
> glide tables — a friendlier front end for your XContest tracks.

## Features

- **Flight summary** — pilot, glider, launch site, date/time (with the recording
  device's timezone), airtime, max altitude, max altitude gain, max sustained
  climb/sink, track length, straight-line distance, open ("free") distance and
  average ground speed.
- **Thermals** (well-formed = **≥ 3 turns**): number of turns + direction, total
  climb, average climb rate, average circling radius, and per-thermal wind.
- **Glides** (straight lines): general course, ground distance, ground speed,
  **ground glide ratio**, and the wind that applied.
- **Wind estimation** from the GPS ground-velocity circle traced while
  thermalling (Kåsa circle fit) — per thermal and overall.
- **Interactive map** (Leaflet / OpenStreetMap) with the track coloured by
  climb/sink, launch & landing markers, and click-to-focus on any phase.
- **Interactive barogram** — altitude over time coloured by vario, with a phase
  strip, hover readout, and click-to-select.
- **Metric ⇄ imperial** toggle (km/m/m·s⁻¹/km·h⁻¹ ⇄ mi/ft/ft·min⁻¹/mph),
  remembered between visits.

## Getting started

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # static bundle in dist/
npm run preview    # serve the production build
```

The build is fully static — host `dist/` anywhere (GitHub Pages, Netlify, an S3
bucket, or just open it). `vite.config.ts` uses a relative `base` so it works
from any subpath.

Click **“Try the sample flight”** to load the bundled Woodrat Mountain track.

## How the analysis works

All maths is in `src/analysis/`:

| File | Responsibility |
|------|----------------|
| `geo.ts` | Haversine distance, bearings, angle helpers, local projection |
| `derive.ts` | Per-fix timing, distance, velocity components, turn rate, smoothed vario |
| `phases.ts` | Thermal & glide detection (circling runs → turns/climb/radius; gaps → glides) |
| `wind.ts` | Wind from the velocity-space circle fit; vector averaging |
| `stats.ts` | Whole-flight stats, takeoff/landing trimming, free-distance DP |
| `analyze.ts` | Pipeline orchestrator |

**Thermal detection** smooths the turn-rate signal, groups sustained circling
into runs (bridging brief straightening between climbs), and reports a run as a
thermal when the *net* heading change is ≥ 3 full turns. The radius comes from
`r = v / ω` averaged over the circle.

**Glides** are the straight stretches between significant circling, filtered by a
minimum duration and distance.

**Max climb / sink** are reported as the best/worst rate *sustained over ~30 s*
(not instantaneous vario spikes) — this is what XContest-style platforms report.

**Free distance** is the longest path through up to 3 turnpoints, solved with an
O(legs · n²) dynamic program over a downsampled track.

### Accuracy

Validated against the XContest figures for the sample flight:

| Metric | XContest | Paranalyzer |
|--------|----------|-------------|
| Airtime | 1:21:46 | 1:21:28 |
| Max altitude | 1853 m | 1853 m |
| Max alt. gain | 1029 m | 1035 m |
| Max climb (sustained) | 1.6 m/s | 1.8 m/s |
| Max sink (sustained) | 2.7 m/s | 2.8 m/s |
| Track length | 37.413 km | 37.16 km |
| Free distance | ~14.09 km | 13.90 km |

> Note: Paranalyzer's **average speed** is true ground speed along the path
> (track length ÷ airtime). XContest's `ø` is an XC-distance-based speed, so the
> two numbers differ by design. XContest's proprietary "route / points" scoring
> is not reproduced.

## Tech

React 18 + TypeScript + Vite, Leaflet for mapping, hand-rolled SVG barogram. No
analysis runs server-side.

`scripts/verify.ts` re-runs the pipeline on the sample and prints the numbers
above — `npx tsx scripts/verify.ts`.
