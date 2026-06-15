# 04 · Manually add a log

**Request:** "Allow manually adding a log, including the attributes."

**Depends on:** nothing (independent of the dashboard epic).
**Effort:** large — touches the core type, the data layer, a new form, the detail
screen, backup round-trip, and recalc.

## Goal

Let a pilot create a flight record by typing its attributes, with **no track
file** — for flights logged on paper, recovered from XContest, or flown before
the pilot used a tracker.

## The core tension

Every existing flight is born from a parsed track:
`importOne → parseTrack → analyzeWithSettings → buildFlightRecord`
([`importFlight.ts:40`](../../packages/app/src/data/importFlight.ts#L40)). The
record then carries a `trackRef`, and the detail screen **reads the track back**
to draw the map and barogram
([`FlightDetailScreen.tsx:60`](../../packages/app/src/screens/FlightDetailScreen.tsx#L60)).

A manual flight has no track, so:

1. it needs a record built **without** `buildFlightRecord`;
2. the detail screen must **not** try to read a track for it;
3. `recalcAll` must **skip** it (today it would `readTrack` → throw → count it as
   `failed`, [`recalc.ts:24`](../../packages/app/src/data/recalc.ts#L24));
4. backup export/import must round-trip it without inventing a track.

A reliable discriminator is needed — **don't infer it from `trackRef === ""`**,
because backup import calls `saveTrack(id, ext, "")` and hands back a non-empty
ref ([`backup.ts:62`](../../packages/app/src/data/backup.ts#L62)). Use an explicit
flag.

## Design

### 1. Model — mark manual records

In `packages/core/src/record.ts`
([`FlightRecord`](../../packages/core/src/record.ts#L5)):

- Add `manual?: boolean`.
- Widen `source` from `"igc" | "gpx" | "kml"` to also allow `"manual"`
  ([`:7`](../../packages/core/src/record.ts#L7)). Audit the few `source`
  consumers (`fileName ?? \`flight.${source}\``) — they only string-interpolate,
  so a new union member is safe.

No `ANALYSIS_VERSION` bump and no DB schema bump: the field is additive and
optional, and `loadDb` already tolerates unknown/missing fields
([`db.ts:19`](../../packages/app/src/data/db.ts#L19)).

### 2. A builder for manual records

`packages/app/src/data/manualFlight.ts`:

```ts
export interface ManualFlightInput {
  startTime: number;          // required (epoch ms; drives sort + dedupe)
  tzOffsetMinutes?: number;
  site?: string; glider?: string; pilot?: string;
  airtime: number;            // required (drives the dashboard)
  timeInThermal?: number; timeInGlide?: number; timeInRidge?: number;
  maxAlt?: number; maxAltGain?: number; maxClimb?: number; maxSink?: number;
  trackLength?: number; straightDistance?: number; freeDistance?: number; avgSpeed?: number;
  thermalCount?: number; glideCount?: number; ridgeCount?: number;
  windSpeed?: number; windFromDeg?: number;
  note?: string; xcontestUrl?: string; xcontestPoints?: number;
}

export async function addManualFlight(input: ManualFlightInput): Promise<string> {
  // id = crypto.randomUUID(); fill numeric gaps with 0; manual: true;
  // source: "manual"; trackRef: ""; analysisVersion: ANALYSIS_VERSION;
  // importedAt: Date.now(); register site via addSiteOption; addFlight(rec);
}
```

Mirror the dedupe in `importOne` — call `findFlightByStartTime`
([`db.ts:51`](../../packages/app/src/data/db.ts#L51)) and surface a duplicate the
same way (reuse `DuplicateDialog`).

### 3. The form (UI)

A dedicated route is cleaner than a modal given the field count. Add
`/flight/new` (a `ManualFlightScreen`) wired in `AppRoot`
([`AppRoot.tsx`](../../packages/app/src/AppRoot.tsx)).

- **Entry point:** a button next to Import in the list header
  ([`FlightsListScreen.tsx:87`](../../packages/app/src/screens/FlightsListScreen.tsx#L87))
  — e.g. an "Add manually" item. On mobile this competes for header space (see
  [doc 06](06-mobile-header-overlap.md)); consider folding Import + Add into one
  "+" menu.
- **Fields:** group as *Identity* (date/time, site via `SiteSelect`, glider,
  pilot), *Time* (airtime, thermal, ridge, glide), *Altitude* (max alt, gain,
  climb, sink), *Distance/Speed*, *Counts*, *Wind*, *XContest* (url, points),
  *Note*.
- **Units:** reuse the display↔SI conversions already written for the filter bar
  — `siToDisplay` / `displayToSI`
  ([`FilterBar.tsx:44`](../../packages/app/src/components/FilterBar.tsx#L44)).
  Promote them to a shared util (e.g. `@paranalyzer/core/units` or an app helper)
  so the form and filter bar stop diverging. Durations use `parseHhMm`/`formatHhMm`.
- **Validation:** require `startTime` and `airtime`; everything else optional and
  defaulted to 0/undefined. Disable Save until valid.

### 4. Detail screen — branch on `manual`

In `FlightDetailScreen`
([`FlightDetailScreen.tsx:40`](../../packages/app/src/screens/FlightDetailScreen.tsx#L40)):

- If `rec.manual`, **skip** `readTrack` / `parseTrack` / `AnalysisView`
  ([`:60`–`:64`](../../packages/app/src/screens/FlightDetailScreen.tsx#L60)).
- Render a manual-summary view instead:
  - the entered stats (reuse `SummaryPanel`-style layout or a simple stat grid);
  - a `TimeBreakdownChart` fed from the entered times — it's pure presentational
    and needs no track ([`:147`](../../packages/app/src/screens/FlightDetailScreen.tsx#L147));
  - the existing Site / XContest / Note editors (they already work off `rec`).
- **Editing (recommended for manual flights):** since nothing is recomputed,
  allow editing every attribute via the same form (reuse `ManualFlightScreen` in
  an "edit" mode that pre-fills from the record and calls `updateFlight`). If we
  want to ship smaller, v1 can reuse only the existing Site/Note/XC editors and
  defer full editing — call that out explicitly.

### 5. Recalc must skip manual flights

In `recalcAll`
([`recalc.ts:21`](../../packages/app/src/data/recalc.ts#L21)): `if (rec.manual)
{ onProgress?.(i+1, total); continue; }` so manual flights aren't read,
re-analysed, or counted as `failed`. Also revisit the stale-check that triggers
recalc on list load
([`FlightsListScreen.tsx:28`](../../packages/app/src/screens/FlightsListScreen.tsx#L28))
— it keys off `analysisVersion`/`timeInGlide`; ensure manual records (which have
both set) don't force a pointless recalc pass.

### 6. Backup round-trip

`createBackupJson` reads each track and tolerates failure with `text: ""`
([`backup.ts:18`](../../packages/app/src/data/backup.ts#L18)) — fine for manual.
The real fix is on **import**: `importBackup` unconditionally
`saveTrack(...)` and overwrites `trackRef`
([`backup.ts:60`](../../packages/app/src/data/backup.ts#L60)). For manual records
it must **skip `saveTrack`, keep `trackRef: ""`, and preserve `manual: true`**.
Guard with `if (rec.manual) { addFlight(rec); } else { …saveTrack… }`.

## Edge cases

- **Duplicate start time** vs an imported flight → reuse the duplicate flow.
- **`source: "manual"`** must be handled anywhere `source` is switched on (grep
  before merging — currently only string interpolation).
- **Drive auto-backup / merge** must carry the `manual` flag too (same code path
  as local backup, so covered by step 6).
- A manual flight contributes to dashboard totals and site pies (docs 01–03)
  automatically — it's just a `FlightRecord`.

## Test

- `npm run typecheck`.
- Manual: add a manual flight → appears in the list, totals update, detail screen
  shows entered stats with no map/barogram and no console error.
- Recalc-all → manual flight untouched, `failed` count excludes it.
- Export backup → import into a clean profile → manual flight returns with
  `manual: true` and `trackRef: ""` (no phantom empty track).

## Suggested slices (to de-risk the large surface)

1. Model flag + builder + minimal form (required fields only) + list entry point.
2. Detail-screen branch (read-only manual summary).
3. Recalc guard + backup round-trip.
4. Full field set + edit mode.
