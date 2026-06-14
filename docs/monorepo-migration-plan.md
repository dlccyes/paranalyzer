# Paranalyzer → Web + Android Monorepo: Plan & Specification

> **Audience:** an implementer (human or AI) who has never seen this repo before.
> This document is prescriptive on purpose. Where a choice exists, **one** option
> is chosen and the alternatives are listed only as "future". Follow the chosen
> path unless a step is impossible.

---

## 0. TL;DR

Convert the current single-package Vite/React web app into an **npm-workspaces
monorepo** with four packages:

| Package | What it is | New? |
|---------|-----------|------|
| `packages/core` | Pure-TypeScript parsers + analysis + types + units (no React, no DOM). | Extracted from today's `src/` |
| `packages/ui` | Shared React "analysis view" (map, barogram, tables, summary). | Extracted from today's `src/components` |
| `apps/web` | The existing analyzer web app. **Features unchanged**, plus an "Get the Android app" download link. | Existing app, slimmed |
| `apps/mobile` | A **Capacitor** Android app that is a full paragliding **flights logger**. | New |

**The Android app is the React web stack wrapped by Capacitor.** It runs the same
React/Leaflet/SVG code inside a native WebView, so the flight-detail screen can
literally reuse `packages/ui`. The "logger" parts (flight list, storage,
backup) are new code around that reused view.

**CI:** `test.yml` (typecheck+build all) stays. `gh-deploy.yml` still publishes
the **web** app to the `gh-pages` branch. A new `android.yml` builds the APK and
publishes it to a rolling `android-latest` GitHub Release; the web app links to
that APK.

**Key decisions (do not re-litigate):**

1. Monorepo tool = **npm workspaces** (repo already uses npm + `package-lock.json`).
2. Android = **Capacitor** (not React Native, not native Kotlin, not Flutter).
3. Mobile storage = **JSON document store on the filesystem** + raw track files
   on the filesystem (not SQLite, for v1).
4. Flights table = **TanStack Table v8** (gives sort + filter + column
   visibility + column reordering for free).
5. Backup format = **single self-contained JSON bundle** (track text embedded
   inline). YAML is an optional alternate writer.
6. Google Drive backup = OAuth + Drive REST v3 into the app's private
   `appDataFolder`; runs on launch if >24 h since last backup, plus a manual
   "Back up now" button.
7. APK distribution = rolling **`android-latest` GitHub Release** asset; web
   links via `VITE_APK_URL`.

---

## 1. Goals & non-goals

### Goals
- One repository, shared analysis core, two shipping apps (web + Android).
- Web app keeps **exactly today's behaviour** (plus one new download link).
- Android app is a flights **logger**:
  1. Persist every uploaded track. Home screen = a sortable/filterable
     list/table of flights (default sort: date/time, newest first).
  2. Airtable-style table: fields can be shown/hidden, reordered, and filtered.
  3. Tap a flight → the **same analysis view the web app shows**.
  4. On import, auto-derive and store fields including **glider**, **time in
     thermal**, **time in ridge soaring** (plus the usual stats).
  5. **No manual editing** of derived fields. The **only** editable field is a
     free-text **Note**.
  6. Delete a flight.
  7. Export + daily backup to **Google Drive**; import a backup. Open format
     (JSON; YAML optional).
- CI: keep publishing web to `gh-pages`; also build the Android APK.

### Non-goals (v1)
- iOS (keep the architecture iOS-ready, but build no iOS target).
- Offline map tiles (Leaflet still fetches OSM tiles over the network).
- Cloud sync / multi-device merge (backup/restore only).
- Editing tracks, manual stat overrides, or re-scoring.

---

## 2. Current state (what exists today)

A pure-frontend SPA: **React 18 + TypeScript + Vite + Leaflet**, no backend.

```
src/
  main.tsx, App.tsx, styles.css, vite-env.d.ts
  types.ts          # Fix, FlightMeta, ParsedTrack, Derived, Phase, Thermal,
                    # BadTurn, Glide, WindEstimate, FlightStats, Flight
  units.ts          # makeFormatter, formatDuration/Clock/Date/TzOffset
  colors.ts         # PHASE_COLORS, varioColor, VARIO_LEGEND, buildVarioSegments
  parsers/          # index.ts (parseTrack/detectFormat), igc.ts, gpx.ts, kml.ts
  analysis/         # analyze.ts, derive.ts, phases.ts, stats.ts, wind.ts, geo.ts
  components/       # SummaryPanel, FlightMap, Barogram, ThermalsTable,
                    # BadTurnsTable, GlidesTable, UnitToggle, WindBadge, Arrow,
                    # FileDrop
public/sample-woodrat.igc
scripts/verify.ts   # re-runs the pipeline on the sample, prints numbers
.github/workflows/  # test.yml, gh-deploy.yml
vite.config.ts      # base: "./"   (relative asset paths)
tsconfig.json
```

**Data flow:** `parseTrack(name, text)` → `ParsedTrack` → `analyzeFlight()` →
`Flight` (`stats`, `thermals`, `glides`, `badTurns`, `phases`, `range`). The UI
renders `Flight`. **All analysis is pure and DOM-free** — this is what makes the
core trivially shareable.

**CI today:**
- `test.yml`: on push/PR to `main` → `npm ci`, `npm run typecheck`, `npm run build`.
- `gh-deploy.yml`: after "Test" succeeds on `main` → build, deploy `dist/` to
  `gh-pages` with `cname: paranalyzer.approximator.net`.

Repo: `https://github.com/dlccyes/paranalyzer`. Web host:
`paranalyzer.approximator.net`.

---

## 3. Target architecture

### 3.1 Directory tree (end state)

```
paranalyzer/
  package.json                 # workspaces root (private, no app code)
  package-lock.json
  tsconfig.base.json           # shared compiler options
  .github/workflows/
    test.yml                   # typecheck + build all (modified)
    gh-deploy.yml              # build apps/web → gh-pages (modified)
    android.yml                # build APK → android-latest release (new)
  docs/
    monorepo-migration-plan.md # this file

  packages/
    core/
      package.json             # name: @paranalyzer/core
      tsconfig.json
      src/
        index.ts               # public barrel (re-exports everything below)
        types.ts               # (moved) + new RidgeSoar, FlightRecord, etc.
        units.ts               # (moved)
        colors.ts              # (moved)
        parsers/               # (moved) index, igc, gpx, kml
        analysis/              # (moved) analyze, derive, phases, stats, wind, geo
          ridge.ts             # NEW: ridge-soaring detection
        record.ts              # NEW: buildFlightRecord(parsed, flight) -> FlightRecord
      sample/sample-woodrat.igc  # (moved from public/) for tests + both apps
      test/                    # node:test unit tests (incl. verify.ts moved here)

    ui/
      package.json             # name: @paranalyzer/ui  (peerDep: react, leaflet)
      tsconfig.json
      src/
        index.ts               # exports AnalysisView + components
        AnalysisView.tsx       # NEW: composes the whole dashboard from a Flight
        styles.css             # (moved) dashboard styles
        components/            # (moved) SummaryPanel, FlightMap, Barogram,
                               # ThermalsTable, BadTurnsTable, GlidesTable,
                               # UnitToggle, WindBadge, Arrow

  apps/
    web/
      package.json             # name: @paranalyzer/web
      index.html
      vite.config.ts           # base: "./"
      tsconfig.json
      public/sample-woodrat.igc
      src/
        main.tsx               # (moved) entry
        App.tsx                # upload hero + <AnalysisView/> + APK link
        FileDrop.tsx           # (moved) web-only drag/drop picker
        shell.css              # web-only chrome (topbar/hero) styles

    mobile/
      package.json             # name: @paranalyzer/mobile
      index.html
      vite.config.ts
      capacitor.config.ts      # appId, appName, webDir
      tsconfig.json
      android/                 # generated by `npx cap add android`, committed
      src/
        main.tsx
        App.tsx                # router: list / detail / settings
        screens/
          FlightsListScreen.tsx
          FlightDetailScreen.tsx
          SettingsScreen.tsx
        components/
          FlightsTable.tsx     # TanStack Table
          ColumnConfigSheet.tsx
          FilterBar.tsx
          ImportButton.tsx
          NoteEditor.tsx
        data/
          model.ts             # FlightRecord (re-export from core) + settings types
          db.ts                # JSON document store (load/save/CRUD)
          trackStore.ts        # raw track file read/write
          backup.ts            # export/import bundle
          drive.ts             # Google Drive auth + upload/download
          importFlight.ts      # pick file -> parse -> analyze -> buildRecord -> save
        shell.css
```

> Convention: **`packages/*`** = libraries (no app, no bundler output you ship),
> **`apps/*`** = shippable apps. This is conventional and keeps mental load low.

### 3.2 Dependency graph

```
            @paranalyzer/core   (pure TS: parse + analyze + types + units + colors)
               ▲          ▲
               │          │
       @paranalyzer/ui    │       (React analysis view; depends on core)
          ▲       ▲       │
          │       │       │
      apps/web   apps/mobile  (apps/mobile depends on core AND ui)
                    │
                 Capacitor (Android native shell + plugins)
```

Rules:
- `core` imports **nothing** from `ui`/apps and uses **no DOM/React/browser
  globals** (it must run under plain Node for tests). The one exception today is
  IGC's use of `atob`; replace with a tiny base64 decode helper so core is
  runtime-agnostic (see §5.4).
- `ui` imports `core` + `react`/`leaflet` (as peer deps). No app imports.
- Apps import `core` and/or `ui`. Apps never import each other.

---

## 4. Technology decisions & rationale

### 4.1 Monorepo tool → **npm workspaces**
The repo already uses npm (`package-lock.json`). Workspaces need zero new tools,
are understood by GitHub Actions caching, and resolve `@paranalyzer/*` packages
locally via symlink. *Future:* pnpm + Turborepo if build caching becomes a pain.

### 4.2 Android approach → **Capacitor**
Considered: React Native/Expo, native Kotlin/Compose, Flutter.

| Approach | Reuse of TS analysis core | Reuse of the analysis **view** | Effort |
|----------|---------------------------|-------------------------------|--------|
| **Capacitor** ✅ | 100% (same TS) | 100% (same React + Leaflet + SVG run in WebView) | **Low** |
| React Native | 100% logic, but UI rewritten (no Leaflet, no DOM SVG) | 0% — rebuild map/barogram in RN | High |
| Native Kotlin | 0% — reimplement all analysis in Kotlin | 0% | Very high |
| Flutter | 0% — reimplement in Dart | 0% | Very high |

Requirement #2 ("tapping a flight shows what the web app displays") plus "be
implementable by lower-effort models" makes **Capacitor** the obvious choice: the
detail screen renders the exact same `AnalysisView`. Capacitor also ships
first-party plugins for the logger needs (Filesystem, Preferences, App,
file-picker via community plugin, Google auth). *Future:* the same Capacitor
config adds an iOS target with `npx cap add ios`.

### 4.3 Mobile storage → **JSON document store + filesystem track files**
A pilot accumulates hundreds (lifetime: low thousands) of flights — small enough
to hold the metadata index in memory and sort/filter in JS. Benefits:
- The on-disk index **is** essentially the backup format → export/import is trivial.
- No native SQLite plugin, schema, or migrations to get wrong.

Each flight = one raw track file (`tracks/<id>.<ext>`) + one JSON record in the
index. Full re-parse/re-analyze happens **lazily** only when a flight is opened.
*Future:* swap the store for `@capacitor-community/sqlite` if scale demands it —
the `db.ts` module is the only thing that changes.

### 4.4 Flights table → **TanStack Table v8** (`@tanstack/react-table`)
Headless, framework-agnostic, and supports column visibility, column ordering,
sorting, and column filters out of the box — exactly the "Airtable-like"
requirement — with state we can serialize into settings/backup.

### 4.5 Backup format → **single self-contained JSON bundle**
One file, human-readable, importable, with track text embedded inline so there
are no external file references to lose. YAML is offered as an alternate writer
(same object graph) for users who prefer it. See §8.10 for the schema.

---

## 5. `packages/core` — the shared logic library

### 5.1 What moves (mechanical)
Move, unchanged except import paths, into `packages/core/src/`:
`types.ts`, `units.ts`, `colors.ts`, `parsers/*`, `analysis/*`. Move
`public/sample-woodrat.igc` → `packages/core/sample/sample-woodrat.igc` and
`scripts/verify.ts` → `packages/core/test/verify.ts` (it already imports the
pipeline; just fix the sample path and run it with `node --test` or `tsx`).

`colors.ts` imports `Flight` from `types` and is DOM-free (returns colour
strings) → it belongs in `core`, not `ui`.

### 5.2 Public API (`packages/core/src/index.ts`)
Re-export the existing public surface so apps import from one place:

```ts
// types
export * from "./types";
// parsing
export { parseTrack, detectFormat } from "./parsers";
export type { SupportedFormat } from "./parsers";
// analysis
export { analyzeFlight } from "./analysis/analyze";
export { computeDerived } from "./analysis/derive";
export { detectPhases, PARAMS } from "./analysis/phases";
export { computeStats, detectActiveRange, freeDistance } from "./analysis/stats";
export { estimateWind, averageWind } from "./analysis/wind";
export {
  haversine, bearing, angleDiff, averageBearing, compassName, toLocalEN,
  EARTH_RADIUS_M,
} from "./analysis/geo";
// formatting + colours
export * from "./units";
export * from "./colors";
// NEW
export { detectRidgeSoaring, RIDGE_PARAMS } from "./analysis/ridge";
export { buildFlightRecord } from "./record";
export type { RidgeSoar, FlightRecord } from "./types";
```

### 5.3 `package.json` (core)
```json
{
  "name": "@paranalyzer/core",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "node --test"
  },
  "devDependencies": { "typescript": "^5.6.3" }
}
```
> We export raw `.ts` (`"main": "src/index.ts"`) and let each app's bundler
> (Vite) compile it. No build step for `core` — simplest possible. tsconfig
> `paths` (see §10) makes editors resolve it.

### 5.4 Make `core` runtime-agnostic
`parsers/igc.ts` calls `atob`. Replace with a local helper so the parser runs
under Node tests and inside any JS runtime:

```ts
// core/src/parsers/base64.ts
export function decodeBase64(b64: string): string {
  if (typeof atob === "function") return atob(b64);
  // Node / other runtimes:
  // eslint-disable-next-line no-undef
  return Buffer.from(b64, "base64").toString("binary");
}
```
Use `decodeBase64(...)` in `extractXCTrackTimezone`. `Intl.DateTimeFormat` is
available in Node ≥ 14, so the tz logic is fine.

### 5.5 NEW — Ridge-soaring detection (`analysis/ridge.ts`)

**Why:** the logger must auto-derive **time in ridge soaring**. Today's analysis
has thermals, glides, and bad turns but no ridge/slope-soaring concept.

**Definition (no terrain data available):** ridge/slope soaring is sustained,
**non-circling** flight that **maintains altitude** (not gliding down, not
thermalling), typically **back-and-forth** along a slope. We detect it from the
GPS signal we already derive.

**Important — additive, does NOT change the web app.** Ridge detection runs as an
extra, independent pass. It may temporally overlap glides; that is fine because
the logger only surfaces the two *summary durations* (`timeInThermal`,
`timeInRidge`), not a strict partition of airtime. Existing thermal/glide/badturn
detection is untouched, so `apps/web` behaves identically.

**Inputs:** `fixes`, `derived` (has `t`, `vario`, `bearing`, `groundSpeed`,
`cumDist`), the airborne `[start, end]`, and the list of circling intervals
(thermals + badTurns, as `[startIdx, endIdx]`) to exclude.

**Parameters** (mirror the style of `phases.ts`):
```ts
export const RIDGE_PARAMS = {
  /** Sliding window (s) over which mean vario is evaluated. */
  windowSec: 30,
  /** Mean vario over the window must be ≥ this (m/s): roughly maintaining height,
   *  i.e. NOT a glide-down. (-0.2 ≈ "holding or gaining".) */
  minMeanVarioMs: -0.2,
  /** Must be moving (m/s) — excludes ground/parked. */
  minGroundSpeedMs: 3,
  /** A ridge run must last at least this long (s). */
  minDurationSec: 60,
  /** Bridge ridge runs separated by less than this (s). */
  bridgeGapSec: 10,
  /** A heading change exceeding this (deg) within reversalWindowSec counts as a
   *  ridge "pass" reversal. */
  reversalDeg: 120,
  reversalWindowSec: 30,
  /** Pattern test A: need at least this many reversals (back-and-forth passes). */
  minReversals: 2,
  /** Pattern test B (alternative to A): "confinement" — bounding-box diagonal /
   *  along-track distance ≤ this ⇒ the pilot stayed put while logging distance. */
  maxConfinementRatio: 0.5,
};
```

**Algorithm:**
```
detectRidgeSoaring(fixes, derived, start, end, circlingIntervals) -> RidgeSoar[]:
  1. available[i] = (start ≤ i ≤ end) AND i not inside any circlingInterval.
  2. For each available i, compute windowMeanVario(i) = mean of derived.vario over
     fixes whose time is within ±windowSec/2 of t[i].
     candidate[i] = available[i]
                    AND windowMeanVario(i) ≥ minMeanVarioMs
                    AND derived.groundSpeed[i] ≥ minGroundSpeedMs.
  3. Group maximal runs of consecutive candidate fixes. Bridge two runs into one
     if the time gap between them < bridgeGapSec (the pilot briefly dipped below
     threshold). Drop runs shorter than minDurationSec.
  4. For each surviving run [a, b], decide it is ridge soaring if EITHER:
       (A) reversals(a, b) ≥ minReversals, where a reversal is a point whose
           heading differs by > reversalDeg from the heading reversalWindowSec
           earlier (counts the back-and-forth passes); OR
       (B) confinement: boundingBoxDiagonal(a, b) / (cumDist[b] - cumDist[a])
           ≤ maxConfinementRatio  (covered distance but stayed in a small area).
     boundingBoxDiagonal = haversine over (minLat,minLon)-(maxLat,maxLon).
  5. Emit a RidgeSoar per accepted run.
```

**Output type** (add to `types.ts`):
```ts
export interface RidgeSoar {
  kind: "ridge";
  startIdx: number; endIdx: number;
  startTime: number; endTime: number;
  duration: number;          // seconds
  startAlt: number; endAlt: number;
  altChange: number;         // metres (usually small)
  trackDistance: number;     // metres along track
  passes: number;            // reversal count (0 if accepted via confinement)
  avgAlt: number;            // mean altitude over the run
}
```

**Wire into the pipeline** (`analysis/analyze.ts`):
```ts
const circling = [...thermals, ...badTurns].map(p => [p.startIdx, p.endIdx]);
const ridgeSoars = detectRidgeSoaring(fixes, derived, start, end, circling);
// add ridgeSoars to the returned Flight, and the two durations to stats (below)
```

**Add to `FlightStats`** (filled in `computeStats`, given the runs):
```ts
timeInThermal: number; // seconds = Σ thermal.duration
timeInRidge:   number; // seconds = Σ ridgeSoar.duration
```
And add `ridgeSoars: RidgeSoar[]` to the `Flight` interface. The web UI simply
doesn't render these new fields (so behaviour is unchanged); the logger reads
them.

**Validation:** there is no ground-truth ridge number in XContest. Validate by:
(a) the sample Woodrat thermic flight should report **near-zero** ridge time;
(b) hand-make/obtain a known soaring track (lots of 180° reversals, flat
altitude) and confirm it reports a large ridge time and ~no thermals. Tune
`RIDGE_PARAMS` against the pilot's own recollection. Document the heuristic
nature in the UI tooltip.

### 5.6 NEW — `buildFlightRecord` (`record.ts`)

Produces the flat, serializable record the logger stores and tabulates. This is
the single source of truth for "auto-derived fields".

```ts
import type { ParsedTrack, Flight } from "./types";

export interface FlightRecord {
  // identity / provenance
  id: string;                 // uuid (caller supplies, e.g. crypto.randomUUID())
  importedAt: number;         // epoch ms when added to the logger
  source: "igc" | "gpx" | "kml";
  fileName?: string;
  trackRef: string;           // filesystem key, e.g. "tracks/<id>.igc"
  analysisVersion: number;    // bump when analysis changes ⇒ allows re-analyze

  // when / where / who (from meta + stats)
  startTime: number;          // epoch ms (flight start) — DEFAULT SORT KEY
  tzOffsetMinutes?: number;
  pilot?: string;
  site?: string;
  glider?: string;            // from meta.gliderType (auto)

  // durations
  airtime: number;            // s
  timeInThermal: number;      // s (auto)
  timeInRidge: number;        // s (auto)

  // altitude / climb
  maxAlt: number; maxAltGain: number;
  maxClimb: number; maxSink: number;

  // distance / speed
  trackLength: number; straightDistance: number; freeDistance: number;
  avgSpeed: number;

  // counts
  thermalCount: number; glideCount: number; ridgeCount: number;

  // wind (overall)
  windSpeed?: number;         // m/s
  windFromDeg?: number;

  // the ONLY user-editable field
  note: string;               // default ""
}

export function buildFlightRecord(
  parsed: ParsedTrack, flight: Flight,
  opts: { id: string; trackRef: string; importedAt?: number },
): FlightRecord { /* read flight.stats / flight.meta / counts → fill struct */ }
```

All values are SI (metres, m/s, seconds) and epoch-ms — the **UI formats** them
via `units.ts`. Storing raw SI keeps records unit-system-agnostic.

### 5.7 Core tests
Keep `verify.ts` as a regression test (numbers in `README.md`). Add:
- a ridge test (samples in §5.5 validation),
- a `buildFlightRecord` snapshot test on the sample (asserts `glider`,
  `timeInThermal`, `timeInRidge`, `airtime`, etc.).
Run with `node --test` (after `tsx`/`esbuild` transpile) in CI.

---

## 6. `packages/ui` — shared analysis view

### 6.1 What moves
Move `src/components/{SummaryPanel,FlightMap,Barogram,ThermalsTable,
BadTurnsTable,GlidesTable,UnitToggle,WindBadge,Arrow}.tsx` and the dashboard
parts of `src/styles.css` into `packages/ui/src/`. `FileDrop.tsx` stays in the
**web** app (it is a desktop drag/drop picker; mobile imports tracks differently).

### 6.2 NEW — `AnalysisView.tsx`
Today `App.tsx` owns the dashboard composition **and** the selection/unit state.
Extract the composition + interaction state into one reusable component so both
apps render an identical view from a `Flight`:

```tsx
export interface AnalysisViewProps {
  flight: Flight;
  units?: UnitSystem;                 // default from localStorage, else "metric"
  onUnitsChange?: (u: UnitSystem) => void;
}

export function AnalysisView({ flight, units, onUnitsChange }: AnalysisViewProps) {
  // owns: selected/hovered Phase, hoverIdx, fmt = makeFormatter(units)
  // renders: <UnitToggle/> + <SummaryPanel/> + <FlightMap/> + <Barogram/> +
  //          <ThermalsTable/> + <BadTurnsTable/> + <GlidesTable/>
  // i.e. exactly today's `<main className="dashboard">` block.
}
```
Lift the `useState` for `selected`/`hovered`/`hoverIdx` and the `fmt` memo out of
`App.tsx` into here verbatim. The web `App.tsx` then just renders the hero +
`<AnalysisView flight={flight} units={units} onUnitsChange={...} />`.

### 6.3 `package.json` (ui)
```json
{
  "name": "@paranalyzer/ui",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts", "./styles.css": "./src/styles.css" },
  "scripts": { "typecheck": "tsc --noEmit" },
  "dependencies": { "@paranalyzer/core": "*" },
  "peerDependencies": {
    "react": "^18.3.1", "react-dom": "^18.3.1",
    "leaflet": "^1.9.4", "react-leaflet": "^4.2.1"
  },
  "devDependencies": {
    "@types/leaflet": "^1.9.12", "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1", "typescript": "^5.6.3"
  }
}
```
`index.ts` exports `AnalysisView` and the individual components (so apps can use
pieces if needed) and points at `./styles.css`.

---

## 7. `apps/web` — the existing analyzer (features unchanged + APK link)

### 7.1 Refactor
- Move `index.html`, `vite.config.ts`, `public/`, `src/main.tsx`, `src/App.tsx`
  here. `App.tsx` now imports `AnalysisView` from `@paranalyzer/ui` and parsing
  from `@paranalyzer/core` (instead of local `./analysis`, `./components`).
- Keep `FileDrop.tsx` here. Keep web-only chrome CSS (`shell.css`); import the
  shared dashboard CSS from `@paranalyzer/ui/styles.css` in `main.tsx`.
- `vite.config.ts` keeps `base: "./"`.
- The sample loads from `${import.meta.env.BASE_URL}sample-woodrat.igc` (keep the
  file in `apps/web/public/`).

**Acceptance:** the web app looks and behaves identically to today.

### 7.2 NEW — "Get the Android app" download link
Add a small header/footer link pointing at the published APK. Make the URL
configurable so CI/local can override it:

```ts
// apps/web/src/App.tsx
const APK_URL = import.meta.env.VITE_APK_URL
  ?? "https://github.com/dlccyes/paranalyzer/releases/download/android-latest/paranalyzer.apk";
```
```tsx
<a className="btn ghost apk-link" href={APK_URL} download>
  📲 Get the Android app (.apk)
</a>
```
Show a one-line note: "Sideload — enable 'Install unknown apps' for your
browser." The link is **static** (no build coupling to the Android job); the
Android workflow guarantees the URL resolves by keeping the `android-latest`
release asset fresh.

---

## 8. `apps/mobile` — the Android flights logger

The mobile app is a React + Vite web app (built to `apps/mobile/dist`) wrapped by
Capacitor. It has three screens behind a hash router: **Flights list**, **Flight
detail**, **Settings**.

### 8.1 Capacitor setup (one-time, commit the result)

```bash
# from apps/mobile/
npm i @capacitor/core @capacitor/app @capacitor/filesystem @capacitor/preferences
npm i -D @capacitor/cli
# community plugins:
npm i @capawesome/capacitor-file-picker        # pick backup/track files
npm i @codetrix-studio/capacitor-google-auth   # Google OAuth for Drive
npx cap init "Paranalyzer" "net.approximator.paranalyzer" --web-dir=dist
npm run build            # produce apps/mobile/dist first
npx cap add android      # generates apps/mobile/android/  → COMMIT THIS
npx cap sync android
```

`capacitor.config.ts`:
```ts
import type { CapacitorConfig } from "@capacitor/cli";
const config: CapacitorConfig = {
  appId: "net.approximator.paranalyzer",
  appName: "Paranalyzer",
  webDir: "dist",
  android: { allowMixedContent: true }, // OSM tiles over http if needed
};
export default config;
```

`vite.config.ts` (mobile): `base: "./"`, `plugins: [react()]`,
`build.outDir: "dist"`. Use **hash routing** (`createHashRouter`) so deep links
work from the `capacitor://`/`file://` origin without server rewrites.

> The committed `android/` folder is a normal Gradle project. CI builds it with
> Gradle (§9.3). Add `apps/mobile/android/app/build/`, `.gradle/`, `local.properties`
> to `.gitignore`.

### 8.2 Data model (`data/model.ts`)
```ts
import type { FlightRecord } from "@paranalyzer/core";
export type { FlightRecord };

export const ANALYSIS_VERSION = 1;          // bump to force re-analyze on open
export const DB_SCHEMA_VERSION = 1;

// One column in the Airtable-like table.
export type FieldId =
  | "startTime" | "glider" | "site" | "pilot"
  | "airtime" | "timeInThermal" | "timeInRidge"
  | "maxAlt" | "maxAltGain" | "maxClimb" | "maxSink"
  | "trackLength" | "straightDistance" | "freeDistance" | "avgSpeed"
  | "thermalCount" | "glideCount" | "ridgeCount"
  | "windSpeed" | "windFromDeg" | "note";

export interface ColumnConfig { id: FieldId; visible: boolean; }

export type FilterOp =
  | "contains" | "equals"            // text
  | "gte" | "lte" | "between"        // number / duration
  | "dateOnOrAfter" | "dateOnOrBefore"; // startTime
export interface FilterRule { field: FieldId; op: FilterOp; value: string | number | [number, number]; }

export interface SortRule { field: FieldId; dir: "asc" | "desc"; }

export interface Settings {
  columns: ColumnConfig[];        // order = display order; visible = shown
  filters: FilterRule[];
  sort: SortRule;                 // default { field: "startTime", dir: "desc" }
  units: "metric" | "imperial";
  lastBackupAt?: number;          // epoch ms (for daily-ish backup)
  drive?: { connected: boolean; folderId?: string };
}

export interface DbDocument {
  schemaVersion: number;          // DB_SCHEMA_VERSION
  flights: FlightRecord[];
  settings: Settings;
}
```
`DEFAULT_SETTINGS` lists every `FieldId` in a sensible order with a sensible
subset visible (e.g. visible: `startTime, glider, site, airtime, timeInThermal,
timeInRidge, maxAltGain, freeDistance, note`).

### 8.3 Storage layout & the `db.ts` / `trackStore.ts` modules

Filesystem (Capacitor `Filesystem`, `Directory.Data` = app-private):
```
Data/
  paranalyzer-db.json     # the DbDocument (the metadata index + settings)
  tracks/<id>.<ext>       # raw uploaded track text, one file per flight
```

`trackStore.ts`:
```ts
saveTrack(id, ext, text): Promise<string>   // writes tracks/<id>.<ext>, returns trackRef
readTrack(trackRef): Promise<string>        // returns raw text
deleteTrack(trackRef): Promise<void>
```

`db.ts` (in-memory cache, write-through):
```ts
loadDb(): Promise<DbDocument>               // read+parse; if missing, seed defaults
saveDb(doc): Promise<void>                  // serialize + write paranalyzer-db.json
listFlights(): FlightRecord[]
getFlight(id): FlightRecord | undefined
addFlight(rec): Promise<void>               // push + saveDb
updateNote(id, note): Promise<void>         // the ONLY field-mutation API
deleteFlight(id): Promise<void>             // remove record + deleteTrack(trackRef)
getSettings()/saveSettings(s)
```
> `updateNote` is the only record-mutation entry point besides add/delete. There
> is deliberately **no** generic "update field" API → enforces "no manual edits".

### 8.4 Screens & navigation
Hash router (`@tanstack/react-router` or `react-router-dom` with
`createHashRouter`):
- `#/` → `FlightsListScreen`
- `#/flight/:id` → `FlightDetailScreen`
- `#/settings` → `SettingsScreen`

App shell: a top bar with title, a "＋ Import" button (→ §8.7), and a gear
(→ Settings). Capacitor `App` plugin: handle the Android hardware **back**
button (pop route; on the list screen, allow default minimize).

### 8.5 Flights list — the Airtable-like table (`FlightsTable.tsx`)

Use **TanStack Table v8**. Column definitions are generated from the `FieldId`
catalog; each column has `id`, a header label, an SI→display formatter (reuse
`units.ts`), and a value accessor.

| Capability | How |
|-----------|-----|
| **Sort by any field** | TanStack `sorting` state ← `settings.sort`. Tap a header to cycle asc/desc. Default `startTime` desc. |
| **Show/hide fields** | TanStack `columnVisibility` ← derived from `settings.columns[].visible`. Toggled in `ColumnConfigSheet`. |
| **Reorder fields** | TanStack `columnOrder` ← order of `settings.columns`. Drag handles (or up/down buttons — simpler, touch-friendly) in `ColumnConfigSheet`. |
| **Filter** | TanStack `columnFilters` derived from `settings.filters`, applied via custom `filterFn`s (text contains, number gte/lte/between, date on/after/before). Editable in `FilterBar`. |

All four states live in `settings` and persist via `saveSettings` → they survive
restarts **and** are included in backups. Formatting respects `settings.units`.

Rendering: a horizontally scrollable table (sticky first column = date) for
density; tapping a **row** navigates to `#/flight/:id`. Long-press a row → a
menu with **Delete** (confirm dialog). Duration fields use `formatDuration`,
times use `formatClock`/`formatDate` with `tzOffsetMinutes`, distances/speeds via
the unit formatter.

`ColumnConfigSheet.tsx`: a bottom sheet listing every field with a visibility
checkbox and up/down reorder controls → writes `settings.columns`.

`FilterBar.tsx`: add/remove `FilterRule`s; each rule = field picker + op picker +
value input(s). "Clear all" resets filters.

### 8.6 Flight detail (`FlightDetailScreen.tsx`) — reuse the web view

```tsx
function FlightDetailScreen({ id }) {
  const rec = getFlight(id);
  const [flight, setFlight] = useState<Flight | null>(null);
  useEffect(() => { (async () => {
    const text = await readTrack(rec.trackRef);
    const parsed = parseTrack(rec.fileName ?? `flight.${rec.source}`, text);
    setFlight(analyzeFlight(parsed));   // re-analyze lazily from the raw track
  })(); }, [id]);

  return flight ? (
    <>
      <AnalysisView flight={flight}
        units={settings.units} onUnitsChange={persistUnits} />
      <NoteEditor value={rec.note} onSave={(t) => updateNote(id, t)} />
    </>
  ) : <Spinner/>;
}
```
This renders the **identical** `SummaryPanel + FlightMap + Barogram + tables`
from `@paranalyzer/ui`. The **only** editable control on this screen is
`NoteEditor` (multiline text + Save). Map tiles need network (documented
limitation); barogram/tables work offline.

> Re-analyzing on open (vs. caching the full `Flight`) keeps the DB small and
> avoids serializing large per-fix arrays. Analysis of one flight is fast.

### 8.7 Import flow (`importFlight.ts` + `ImportButton.tsx`)
```
onImport():
  1. file = FilePicker.pickFiles({ types: igc/gpx/kml or */* }) → name + data(text)
  2. id = crypto.randomUUID()
  3. ext = extension(name)        // igc | gpx | kml
  4. trackRef = await saveTrack(id, ext, text)
  5. parsed = parseTrack(name, text)        // may throw → toast the message
  6. flight = analyzeFlight(parsed)
  7. rec = buildFlightRecord(parsed, flight, { id, trackRef })
  8. await addFlight(rec)
  9. navigate(#/flight/id)
```
Support selecting **multiple** files (loop steps 2–8, then land on the list).
Dedupe suggestion: if a track with the same `startTime` + `airtime` exists, warn
before adding (optional).

### 8.8 Delete (requirement #5)
From the list row menu or the detail screen: confirm → `deleteFlight(id)` (drops
the record and its track file) → return to list.

### 8.9 Note editing (requirement #4)
`NoteEditor`: a `<textarea>` seeded with `rec.note`, a Save button → `updateNote`.
This is the **only** mutation of a flight besides delete. No other field is
editable anywhere in the UI.

### 8.10 Export / Import backup (requirement #6)

**Bundle schema** (`backup.ts`) — one self-contained file:
```ts
interface BackupBundle {
  format: "paranalyzer-backup";
  version: 1;
  exportedAt: number;                 // epoch ms
  app: { name: "Paranalyzer"; analysisVersion: number };
  settings: Settings;                 // columns/filters/sort/units carried over
  flights: Array<FlightRecord & {
    track: { ext: "igc"|"gpx"|"kml"; text: string }; // raw track inline
  }>;
}
```
- **Export** → build the bundle (read each `trackRef` via `readTrack`, inline its
  text), `JSON.stringify(bundle, null, 2)`, write to
  `Data/paranalyzer-backup-<yyyymmdd-hhmm>.json`, then share/save via the
  Filesystem + a share intent (or copy to Downloads). Default = JSON.
  - *YAML option:* same object via a tiny YAML writer (`yaml` package) →
    `.yaml`. Reader auto-detects by extension/first bytes.
- **Import** → `FilePicker` a `.json`/`.yaml` bundle → parse → validate
  `format/version` → for each flight: write its `track.text` to
  `tracks/<id>.<ext>`, strip the inline `track`, upsert the record. Then merge
  `settings`. Offer **Merge** (skip ids that already exist) vs **Replace** (wipe
  DB + tracks first). Importing the file the app exported round-trips exactly.

Versioned (`version: 1`) so future schema changes can migrate on import.

### 8.11 Google Drive backup (requirement #6)

**Auth:** `@codetrix-studio/capacitor-google-auth` with scope
`https://www.googleapis.com/auth/drive.appdata` (app-private folder — the user
need not see backup clutter; least-privilege). Configure an OAuth client ID
(Android, SHA-1 of the signing key) in Google Cloud Console; store the client ID
in `capacitor.config`/strings. "Connect Google Drive" lives in Settings →
`settings.drive.connected = true`.

**Upload (`drive.ts`):** use Drive REST v3 with the access token:
- Create/locate a backup file in `appDataFolder` (e.g. `paranalyzer-backup.json`);
  keep a rolling current file plus optional dated copies.
- `POST https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`
  (metadata `{ name, parents:["appDataFolder"] }` + the JSON bundle body) to
  create; `PATCH .../files/{id}?uploadType=media` to update.
- On success set `settings.lastBackupAt = Date.now()`.

**"Daily" schedule (pragmatic):** Capacitor JS cannot reliably run in the
background on Android, so v1 does **launch-triggered** backup:
```
on app resume / startup:
  if settings.drive.connected and (now - (lastBackupAt ?? 0) > 24h):
    runBackup()   // build bundle → upload → set lastBackupAt
```
Plus a manual **"Back up now"** button in Settings (always available). This
satisfies "daily backup" for any app that's opened ~daily and is honest about the
platform limit. *Future (true daily background):* a small native Android
**WorkManager** periodic job + a Capacitor plugin method that builds & uploads
the bundle without the WebView being foreground. Mark as a follow-up.

**Restore from Drive:** Settings → "Restore from Drive" → download the
`appDataFolder` bundle via Drive REST (`GET files/{id}?alt=media`) → feed into the
same **Import** path (§8.10) with Merge/Replace choice.

### 8.12 Mobile `package.json` (sketch)
```json
{
  "name": "@paranalyzer/mobile",
  "private": true, "type": "module",
  "scripts": {
    "dev": "vite", "build": "tsc --noEmit && vite build",
    "typecheck": "tsc --noEmit",
    "cap:sync": "cap sync android",
    "android:assembleDebug": "cd android && ./gradlew assembleDebug"
  },
  "dependencies": {
    "@paranalyzer/core": "*", "@paranalyzer/ui": "*",
    "react": "^18.3.1", "react-dom": "^18.3.1",
    "leaflet": "^1.9.4", "react-leaflet": "^4.2.1",
    "@tanstack/react-table": "^8.20.5",
    "react-router-dom": "^6.26.0",
    "@capacitor/core": "^6", "@capacitor/app": "^6",
    "@capacitor/filesystem": "^6", "@capacitor/preferences": "^6",
    "@capawesome/capacitor-file-picker": "^6",
    "@codetrix-studio/capacitor-google-auth": "^3"
  },
  "devDependencies": {
    "@capacitor/cli": "^6", "@vitejs/plugin-react": "^4.3.4",
    "@types/leaflet": "^1.9.12", "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1", "typescript": "^5.6.3", "vite": "^5.4.11"
  }
}
```
(Pin to the Capacitor major that `npx cap init` installs; keep all `@capacitor/*`
on the same major.)

---

## 9. CI/CD

### 9.1 Root scripts & workspaces (`/package.json`)
```json
{
  "name": "paranalyzer-monorepo",
  "private": true,
  "workspaces": ["packages/*", "apps/*"],
  "scripts": {
    "typecheck": "npm run typecheck --workspaces --if-present",
    "build:web": "npm run build -w @paranalyzer/web",
    "build:mobile": "npm run build -w @paranalyzer/mobile",
    "test": "npm run test --workspaces --if-present"
  },
  "devDependencies": { "typescript": "^5.6.3" }
}
```

### 9.2 `test.yml` (modified) — typecheck + build everything
```yaml
name: Test
on:
  push: { branches: [main] }
  pull_request: { branches: [main] }
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
      - run: npm run build:web
      - run: npm run build:mobile        # ensures the Capacitor web bundle compiles
```

### 9.3 `gh-deploy.yml` (modified) — web → gh-pages (unchanged behaviour)
Only the build command and the publish folder change to the new web path. The
trigger, CNAME, and target branch stay the same.
```yaml
name: Deploy to GitHub Pages
on:
  workflow_run:
    workflows: ["Test"]
    types: [completed]
    branches: [main]
permissions: { contents: write }
jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    if: ${{ github.event.workflow_run.conclusion == 'success' }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npm run build:web
        env:
          # point the in-page download link at the rolling APK release
          VITE_APK_URL: https://github.com/dlccyes/paranalyzer/releases/download/android-latest/paranalyzer.apk
      - uses: JamesIves/github-pages-deploy-action@v4
        with:
          folder: apps/web/dist          # was: dist
          branch: gh-pages
          cname: paranalyzer.approximator.net
```

### 9.4 `android.yml` (new) — build APK → rolling `android-latest` release
v1 ships an **unsigned debug** APK (installable via sideload; zero secrets). The
signed-release block below is the production upgrade.
```yaml
name: Android
on:
  push: { branches: [main] }
  workflow_dispatch: {}
permissions: { contents: write }     # to create/update the release
jobs:
  build-apk:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - uses: actions/setup-java@v4
        with: { distribution: 'temurin', java-version: '17' }
      # ubuntu-latest ships the Android SDK; setup-android ensures cmdline-tools.
      - uses: android-actions/setup-android@v3

      - run: npm ci
      - run: npm run build:mobile
      - run: npm run cap:sync -w @paranalyzer/mobile   # runs `cap sync android`

      - name: Assemble debug APK
        working-directory: apps/mobile/android
        run: ./gradlew --no-daemon assembleDebug

      - name: Stage APK
        run: |
          mkdir -p out
          cp apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk out/paranalyzer.apk

      - name: Publish rolling release
        uses: softprops/action-gh-release@v2
        with:
          tag_name: android-latest
          name: Android (latest build)
          files: out/paranalyzer.apk
          prerelease: true
```
> Result: a stable URL the web app links to:
> `https://github.com/dlccyes/paranalyzer/releases/download/android-latest/paranalyzer.apk`.
> Each push to `main` overwrites the asset, so the link always serves the newest
> build.

**Signed release APK (production upgrade).** Generate a keystore once; store
`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`,
`ANDROID_KEY_PASSWORD` as GitHub Secrets. Add a signing config to
`apps/mobile/android/app/build.gradle` reading from env, then in CI:
```yaml
      - name: Decode keystore
        run: echo "$ANDROID_KEYSTORE_BASE64" | base64 -d > apps/mobile/android/app/release.keystore
        env: { ANDROID_KEYSTORE_BASE64: ${{ secrets.ANDROID_KEYSTORE_BASE64 }} }
      - name: Assemble release APK
        run: cd apps/mobile/android && ./gradlew --no-daemon assembleRelease
        env:
          ANDROID_KEYSTORE_PASSWORD: ${{ secrets.ANDROID_KEYSTORE_PASSWORD }}
          ANDROID_KEY_ALIAS: ${{ secrets.ANDROID_KEY_ALIAS }}
          ANDROID_KEY_PASSWORD: ${{ secrets.ANDROID_KEY_PASSWORD }}
      # then cp .../apk/release/app-release.apk out/paranalyzer.apk
```
A signed APK is required for a stable upgrade identity and for any future Play
Store track. The Google Drive OAuth client must register the signing key's SHA-1
(debug vs release SHA-1 differ — register both during development).

---

## 10. TypeScript project wiring

`tsconfig.base.json` (root):
```json
{
  "compilerOptions": {
    "target": "ES2020", "module": "ESNext", "moduleResolution": "bundler",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx", "strict": true,
    "noUnusedLocals": true, "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "isolatedModules": true, "skipLibCheck": true,
    "allowImportingTsExtensions": true, "noEmit": true,
    "useDefineForClassFields": true, "moduleDetection": "force",
    "baseUrl": ".",
    "paths": {
      "@paranalyzer/core": ["packages/core/src/index.ts"],
      "@paranalyzer/ui": ["packages/ui/src/index.ts"]
    }
  }
}
```
Each package/app `tsconfig.json` does `"extends": "../../tsconfig.base.json"` and
sets its own `include`. `core` removes `DOM` from `lib` if you want to *guarantee*
it stays DOM-free (optional; keep DOM for now since `atob` fallback handles
Node). Vite resolves `@paranalyzer/*` via workspace symlinks automatically; add
the same `paths` to each Vite config only if editor/test resolution needs it.

---

## 11. Phased implementation plan (with acceptance criteria)

Each phase is independently verifiable. Do them in order.

### Phase 0 — Monorepo skeleton
- Create root `package.json` (workspaces) + `tsconfig.base.json`.
- Create empty `packages/core`, `packages/ui`, `apps/web`, `apps/mobile` with
  their `package.json` + `tsconfig.json`.
- `npm install` resolves the workspace graph.
- **Accept:** `npm ls` shows the four `@paranalyzer/*` packages linked.

### Phase 1 — Extract `core` (no behaviour change)
- Move `types/units/colors/parsers/analysis` + sample into `packages/core`.
- Add `decodeBase64` (§5.4); add the `index.ts` barrel.
- Move `verify.ts` into `core/test`; it passes against the sample.
- **Accept:** `npm test -w @paranalyzer/core` reproduces the README numbers.

### Phase 2 — Extract `ui` + `AnalysisView`
- Move dashboard components + styles into `packages/ui`.
- Add `AnalysisView` (lift selection/unit state out of `App.tsx`).
- **Accept:** `packages/ui` typechecks; no app yet.

### Phase 3 — Rewire `apps/web` (parity)
- Move web files; `App.tsx` consumes `@paranalyzer/ui` + `@paranalyzer/core`.
- `npm run dev -w @paranalyzer/web` and `build:web` work; UI identical to today.
- **Accept:** load sample + a real track → same stats, map, barogram, tables as
  current production. Update `gh-deploy.yml` to `apps/web/dist`; deploy still
  green.

### Phase 4 — Ridge analysis + flight record (core)
- Implement `analysis/ridge.ts`, add `ridgeSoars` to `Flight` and
  `timeInThermal`/`timeInRidge` to `FlightStats`.
- Implement `record.ts` `buildFlightRecord`.
- Add tests (§5.7).
- **Accept:** sample → near-zero ridge time; `buildFlightRecord` returns correct
  `glider`, durations, counts; web app still unchanged.

### Phase 5 — Mobile shell + storage + import + detail
- Vite React app + Capacitor init + `npx cap add android` (commit `android/`).
- `db.ts` / `trackStore.ts` / `importFlight.ts`; list (basic), detail
  (`AnalysisView` + `NoteEditor`), delete.
- **Accept (on device/emulator):** import a track → it appears in the list →
  open it → identical analysis view → add a note (persists) → delete it.

### Phase 6 — Airtable-like table
- `FlightsTable` (TanStack) + `ColumnConfigSheet` + `FilterBar`; persist
  sort/visibility/order/filter in `settings`.
- **Accept:** default sort = newest first; can sort by another field; can hide a
  field; can reorder fields; can filter (e.g. glider contains "X", airtime ≥ N);
  all survive an app restart.

### Phase 7 — Backup: local export/import
- `backup.ts` export → JSON bundle; import (Merge/Replace).
- **Accept:** export → wipe → import same file → identical flights + settings.

### Phase 8 — Google Drive
- Google auth, `drive.ts` upload/restore, launch-trigger + manual button.
- **Accept:** connect Drive → "Back up now" creates an `appDataFolder` file →
  "Restore from Drive" on a clean install restores all flights.

### Phase 9 — Android CI + APK link
- Add `android.yml`; confirm the `android-latest` asset publishes.
- Web shows the working download link (`VITE_APK_URL`).
- **Accept:** push to `main` → APK release updates; web link installs the app.

---

## 12. Testing & validation
- **Core unit tests** (`node --test`): parser round-trips, `verify.ts` numbers,
  ridge detection on thermic vs soaring fixtures, `buildFlightRecord` snapshot.
- **Web parity:** manual + screenshot compare against current production on the
  sample and a real flight.
- **Mobile:** test on an Android emulator (API 34) and one physical device.
  Checklist mirrors the Phase 5–8 acceptance criteria, plus: hardware back
  button, offline behaviour (tables work, map tiles blank), large track (e.g. a
  6-hour XC) import time.
- **Backup round-trip:** export → import equality test (ids, notes, settings).

---

## 13. Risks, limitations, future
- **Background backup:** v1 backs up on launch (>24 h) + manual button — true
  daily background needs a native WorkManager job (future, §8.11).
- **Offline maps:** Leaflet fetches OSM tiles online; no tiles without signal.
  Future: bundle an offline tile pack or vector tiles.
- **Ridge heuristic:** terrain-free detection is approximate; expose the params
  and validate against the pilot's recollection. It is additive and never
  changes the web app's numbers.
- **iOS:** out of scope but reachable — `npx cap add ios` + an `ios.yml`; the
  Drive plugin and Filesystem APIs are cross-platform.
- **APK trust:** sideloaded APKs trip "unknown sources"; document the steps. A
  signed APK (and later a Play listing) improves trust and upgrade identity.
- **Storage scale:** if a user imports thousands of flights and the JSON index
  gets slow, migrate `db.ts` to `@capacitor-community/sqlite` (only that module
  changes; the record shape and backup format stay the same).

---

## 14. Quick reference — where each requirement is satisfied

| Requirement | Section |
|-------------|---------|
| Monorepo, web + Android, iOS-ready | §3, §4.2 |
| gh-pages publish still runs | §9.3 |
| Android build workflow | §9.4 |
| Web link to download APK | §7.2, §9.4 |
| Web features unchanged | §7.1 |
| Store tracks; list/table home, default sort by date | §8.3, §8.5 |
| Show/hide + reorder + filter fields (Airtable-like) | §8.5 |
| Tap flight → web analysis view | §8.6 |
| Auto fields incl. glider, time in thermal, time in ridge | §5.5, §5.6 |
| No manual edits except Note | §8.3 (`updateNote` only), §8.9 |
| Delete entry | §8.8 |
| Export + daily Google Drive backup + import; open format | §8.10, §8.11 |
| Detailed enough for low-effort implementation | this whole doc |
```