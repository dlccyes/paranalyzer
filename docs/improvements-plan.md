# Improvements plan — round 2

Scope: five changes spanning the analysis engine (`packages/core`), the
analysis UI (`packages/ui`), and the shared app shell (`packages/app`). Applies
to both web and mobile unless noted (most of this lives in shared packages, so
it lands on both automatically).

Status legend: ☐ todo · ◐ partial · ☑ done

---

## 1. XContest link field (manual input)

**Goal:** let the user paste the URL of the flight's XContest page and store it
per flight, shown/editable on the flight detail screen.

**Current state:** `FlightRecord` (in [record.ts](packages/core/src/record.ts))
has `xcontestPoints?: number` and a manual editor row in
[FlightDetailScreen.tsx](packages/app/src/screens/FlightDetailScreen.tsx). There
is no link field yet.

**Changes:**
- `packages/core/src/record.ts`
  - Add `xcontestUrl?: string` to `FlightRecord`. Leave it out of
    `buildFlightRecord` defaults (set only via user edit / restore).
- `packages/app/src/data/db.ts`
  - Add `updateXcontestUrl(id, url: string | undefined)` (thin wrapper over the
    existing generic `updateFlight`).
  - Export it from [index.ts](packages/app/src/index.ts).
- `packages/app/src/screens/FlightDetailScreen.tsx`
  - Add a text input row "XContest" next to the existing XC pts row, debounced /
    on-blur save like the points field. Normalize: trim; treat empty as
    `undefined`. Optional light validation (must start with `http`).
  - When set, render the value as a clickable link (opens in a new tab on web;
    on mobile open via the system browser — see note below).
- `packages/app/src/data/model.ts`
  - Add `xcontestUrl` to `FieldId`, `ALL_FIELDS`, `FIELD_LABELS` ("XC link"),
    `FIELD_TYPES` (`"text"`). Default it to hidden in `DEFAULT_VISIBLE`.
  - In [FlightsTable.tsx](packages/app/src/components/FlightsTable.tsx), render
    the column as a shortened link (e.g. the trailing path segment) so the table
    stays narrow.

**Mobile link opening (decided: add `@capacitor/browser`):** add
`openExternal(url: string): Promise<void>` to the `PlatformAdapter` interface in
[platform.ts](packages/app/src/platform.ts).
- Web impl: `window.open(url, "_blank", "noopener")`.
- Mobile impl: `Browser.open({ url })` from `@capacitor/browser` (add the
  dependency to `apps/mobile/package.json`; run `npm install` + `npx cap sync`).
- The detail-screen link calls `getPlatform().openExternal(url)` rather than a
  raw anchor, so behavior is correct on both platforms.

---

## 2. XContest points auto-calculation

**Goal:** compute XContest "free flight" points automatically from the track.
**Decided: auto-calc only** — the manual points input is removed; `xcontestPoints`
is always derived from the track and refreshed by Recalculate (feature 3).

**Current state:** `freeDistance()` in
[stats.ts](packages/core/src/analysis/stats.ts) already does an optimal
open-distance optimization (DP over up to `maxLegs = 4` legs = 3 turnpoints,
down-sampled to ≤250 points). That is exactly the geometry of XContest open
distance, but with **no scoring coefficient and no triangle bonuses**.

**Decided: use the official World XContest algorithm via the `igc-xc-score`
library** rather than a hand-rolled approximation. `igc-xc-score`
(npm, MIT) implements XContest scoring exactly — branch-and-bound optimization
over the three World disciplines with their real coefficients:

| Discipline    | Coeff. | Notes                                            |
|---------------|--------|--------------------------------------------------|
| Free flight   | 1.0    | open distance via up to 3 turnpoints             |
| Flat triangle | 1.2    | closing ≤ 20% of perimeter                       |
| FAI triangle  | 1.4    | each leg ≥ 28% of perimeter, closing ≤ 20%       |

The library is the source of truth for coefficients and closure rules, so we
don't hand-maintain them. It also returns the optimal turnpoints, which we can
later draw on the map.

**Approach — new module `packages/core/src/analysis/score.ts`:**
- Add dependency `igc-xc-score` to `packages/core/package.json`.
- `scoreFlight(fixes, start, end): XcScore`
  - Adapt our `Fix[]` to the library's expected flight shape:
    `{ fixes: fixes.slice(start, end+1).map(f => ({ latitude: f.lat,
    longitude: f.lon, timestamp: f.time })) }`. This works for IGC **and**
    GPX/KML flights since it only needs lat/lon/time.
  - Run the solver to completion under a budget:
    ```ts
    import { solver, scoringRules } from "igc-xc-score";
    const it = solver(flight, scoringRules.XContest, { maxcycle: <budget> });
    let r; do { r = it.next(); } while (!r.done);
    const s = r.value; // s.score, s.scoreInfo.distance (km), s.opt.scoring.name
    ```
  - Return `{ points: s.score, distanceM: s.scoreInfo.distance * 1000,
    type: s.opt.scoring.name, turnpoints: s.scoreInfo.tp }`.
  - Wrap in try/catch: on solver error or empty track, return a zero score
    rather than throwing (keeps import/recalc resilient).
- Add `xcScore: XcScore` to `FlightStats`, populated in `computeStats` (or
  computed in `analyzeFlight` and attached — solver cost means compute it once).
- `buildFlightRecord` writes `xcontestPoints` from `stats.xcScore.points`
  (rounded to 2 dp) and stores `xcScore.type` for display.

**Compute budget (the one real caveat).** The solver is an optimizer, not a
formula. Typical XC tracks finish in well under a second, but it iterates to
refine the optimum. Set a `maxcycle`/time budget and accept best-so-far,
especially on mobile and inside the Recalculate-all loop (feature 3). Expose the
budget as a constant so it's tunable. Because it's now part of the analysis
pipeline, `analyzeFlight` becomes mildly heavier — fine for one-at-a-time import
and detail view; for bulk Recalculate, consider yielding between flights so the
UI stays responsive.

**UI (auto-calc only):**
- Show the computed score + type in [SummaryPanel.tsx](packages/ui/src/components/SummaryPanel.tsx)
  (e.g. "XC: 42.1 pts · FAI triangle").
- **Remove** the manual XC pts `<input>` row from
  [FlightDetailScreen.tsx](packages/app/src/screens/FlightDetailScreen.tsx) and
  drop `updateXcontestPoints` usage there; display the computed value read-only.
  (`updateXcontestPoints` in db.ts can stay or be removed — no longer called from
  UI.)

---

## 3. "Recalculate" button in Settings

**Goal:** re-run analysis on every stored flight from its saved IGC/GPX/KML text
and refresh all derived fields. Needed because analysis logic changes over time
(ridge redefinition, scoring, etc.) and old records carry stale derived values
and an old `analysisVersion`.

**Current state:** each `FlightRecord` stores `analysisVersion`
(`ANALYSIS_VERSION`, currently `1`). Track text is retrievable via
`getPlatform().tracks.readTrack(trackRef)`. Nothing recomputes existing records.

**Changes:**
- `packages/app/src/data/recalc.ts` (new):
  - `recalcAll(onProgress?): Promise<{ updated: number; failed: number }>`
    - For each flight: `readTrack` → `parseTrack` → `analyzeFlight` →
      `buildFlightRecord(parsed, flight, { id, trackRef, importedAt })`.
    - **Preserve user-entered fields:** `note`, `site`, `xcontestUrl`. Everything
      derived — including `xcontestPoints` (auto-calc only) — is recomputed.
      Merge: `{ ...recomputed, note, site, xcontestUrl }`.
    - Write back via `updateFlight(id, patch)`.
    - Catch per-flight errors (missing/corrupt track) and count failures rather
      than aborting the whole run.
  - Export from `index.ts`.
- `packages/app/src/screens/SettingsScreen.tsx`
  - New "Maintenance" section with a "Recalculate all flights" button using the
    existing `run()` helper + toast (`"Recalculated N flights (M failed)"`).
    Disable while busy; show a simple progress count if easy.

**Note:** `ANALYSIS_VERSION` should be bumped (→ 2) whenever this round's
analysis changes land, so the version on records meaningfully reflects staleness.
Consider surfacing "X flights on an old analysis version — recalculate?" hint in
Settings (optional, nice-to-have).

---

## 4. Ridge / slope soaring redefinition

**Goal:** broaden ridge detection. The current detector
([ridge.ts](packages/core/src/analysis/ridge.ts)) requires either ≥2 heading
reversals (back-and-forth passes, pattern A) **or** spatial confinement (pattern
B). The new definition:

> Soaring that is **not circling** (no 360s, no figure-8s) and **not constantly
> sinking** — generally maintaining altitude. This includes flying a straight
> line while holding height, or short ups-and-downs that net out near zero. Do
> **not** require reversals or confinement.

**Interpretation / new rule:** a ridge run is a maximal stretch of active,
non-circling flight where altitude is **maintained** over a sliding window —
i.e. window-mean vario ≥ a small negative threshold AND the segment does not net
a large altitude loss — regardless of heading pattern.

**Changes to `ridge.ts`:**
- Keep: active-range mask, exclusion of circling intervals (thermals + bad
  turns + the figure-8 case below), window-mean vario candidate test, min
  ground speed, run grouping, gap bridging, min duration.
- **Remove** the pattern-A/pattern-B gate (`minReversals`, `confinementRatio`,
  `maxConfinementRatio`). Qualification becomes purely the
  "non-circling + maintaining altitude" run test.
- **Add a net-altitude guard** so a long steady glide-out isn't mislabeled
  ridge: require `altChange >= -maxNetLossM` over the run (e.g. small allowed
  net loss), or equivalently require window-mean vario near zero throughout
  (already the candidate test). Tune via `RIDGE_PARAMS`.
- **Figure-8 exclusion:** figure-8s are non-circling by net turn but are clearly
  soaring-in-place patterns; the user says "no figure 8s." Detect sustained
  oscillating high turn-rate (alternating sign, |turnRate| repeatedly above the
  circling threshold) and exclude those fixes from ridge candidacy too. Simplest
  implementation: also exclude any fix whose smoothed |turnRate| exceeds the
  circling threshold even if it didn't form a full circling *run* (catches both
  partial circles and figure-8 lobes). Verify against a known ridge track.
- Keep `passes` in the `RidgeSoar` type for display but it's now informational,
  not a gate (or repurpose to "altitude held %").

**`timeInRidge` consistency (the explicit ask):** `computeStats` already derives
`timeInRidge` as `sum(ridgeSoars.duration)`
([stats.ts:52](packages/core/src/analysis/stats.ts)). Because it's defined off
the same `ridgeSoars` array, it automatically uses the new algorithm — no
separate code path. ✅ Just confirm there's no other place computing ridge time.

**Params (`RIDGE_PARAMS`) review:**
- `minMeanVarioMs` (−0.2): keep/tune — this is the "not constantly sinking" knob.
- Add `maxNetLossM` (net altitude guard).
- `minDurationSec`, `minGroundSpeedMs`, `bridgeGapSec`: keep.
- Drop reversal/confinement params (or keep unused + deprecated comment).

**Ridge/glide overlap (decided: exclude ridge from glides).** A straight
ridge-soar otherwise reads like a flat glide and would be double-counted. Plan:
- Detect ridge soaring *before* glides so its intervals are known. Currently
  ridge runs after phases ([analyze.ts](packages/core/src/analysis/analyze.ts));
  reorder so ridge detection happens first (it only needs `derived` + circling
  intervals from the circling-run pass, not full glides), then pass ridge
  intervals into `detectPhases` so `maybePushGlide` skips/splits glide candidates
  that fall inside a ridge segment.
- Alternative if reordering is awkward: keep order but, after both passes,
  subtract ridge-overlapping spans from glides and recompute affected glide
  stats. Reordering is cleaner — prefer it.
- Ensure glide-derived display in [GlidesTable.tsx](packages/ui/src/components/GlidesTable.tsx)
  reflects the reduced set.

Bump `ANALYSIS_VERSION` so a Recalculate (feature 3) refreshes old flights.

---

## 5. Sortable columns in the detail tables

**Goal:** click a column header to sort, in the Thermals, Bad turns, and Glides
tables ([ThermalsTable.tsx](packages/ui/src/components/ThermalsTable.tsx),
[BadTurnsTable.tsx](packages/ui/src/components/BadTurnsTable.tsx),
[GlidesTable.tsx](packages/ui/src/components/GlidesTable.tsx)).

**Current state:** these are plain `<table>`s rendering the arrays in detection
(chronological) order. No sorting. The main flights list uses
`@tanstack/react-table`, but these three are hand-rolled and small.

**Approach — lightweight shared hook (no react-table dependency in `packages/ui`):**
- Add `packages/ui/src/components/useSortableRows.ts`:
  - `useSortableRows<T>(rows, columns)` returning `{ sorted, sortKey, sortDir, toggle(key) }`.
  - `columns` maps a column key → accessor `(row) => number | string`.
  - Tri-state or two-state toggle (asc ⇄ desc); default unsorted = original
    order (preserve the `#` index meaning by computing display index before
    sort, or show original detection number).
- Each table:
  - Define a `columns` accessor map (start→`startTime`, dur→`duration`,
    turns→`turns`, climb→`altChange`, rate→`climbRate`, radius→`avgRadius`,
    wind→`wind?.speed`, etc.; glides also course/dist/speed/sink/ratio/vs-wind).
  - Make `<th>`s clickable with an asc/desc caret (reuse the visual convention
    from the flights table: " ▲" / " ▼"). Add a `.sortable` class + cursor style
    to [styles.css](packages/ui/src/styles.css).
  - Keep the leading `#` as the **original detection index** so a sorted view
    still tells you "thermal #3 of the flight." Compute it before sorting.
- Selection/hover still keyed by phase identity, so sorting doesn't break the
  map/barogram linkage.

**State scope:** per-table local `useState` (resets on flight change) is fine; no
need to persist sort prefs for these.

---

## Cross-cutting

- **`ANALYSIS_VERSION` bump** ([record.ts](packages/core/src/record.ts)) once
  features 2 and 4 land (→ 2). Drives the Recalculate hint in feature 3.
- **Data model migration:** new optional fields (`xcontestUrl`, recomputed
  `xcontestPoints`) are additive and backward-compatible; old records load fine
  via the existing `{ ...DEFAULT_SETTINGS, ...doc.settings }` merge and untouched
  flight fields.
- **New dependencies:** `igc-xc-score` in `packages/core`; `@capacitor/browser`
  in `apps/mobile`. Run `npm install` (+ `npx cap sync` for the Capacitor plugin).
- **Exports:** update [packages/app/src/index.ts](packages/app/src/index.ts) and
  [packages/core/src/index.ts](packages/core/src/index.ts) for new functions/types
  (`updateXcontestUrl`, `recalcAll`, `scoreFlight`, `XcScore`).
- **Typecheck:** `npm run typecheck` across all workspaces must stay clean.
  Confirm `igc-xc-score` ships types or add a `d.ts` shim if not.

## Suggested order

1. Feature 5 (sortable tables) — self-contained, no analysis risk.
2. Feature 1 (XContest link) — small data-model + UI.
3. Feature 4 (ridge redefinition) — core algorithm; verify against real tracks.
4. Feature 2 (XContest scoring) — add `igc-xc-score`, wire into the pipeline.
5. Feature 3 (Recalculate) — ties 2 & 4 together; bump `ANALYSIS_VERSION` here.

## Decisions (resolved)

1. **XContest points — auto-calc only.** Manual input removed; always derived
   from the track and refreshed by Recalculate.
2. **Mobile external-link opening — add `@capacitor/browser`** via an
   `openExternal` platform method.
3. **Ridge vs glide overlap — exclude ridge from glides.** Detect ridge first
   and skip glide candidates inside ridge segments (see feature 4).
4. **XContest scoring — use official World algorithm via `igc-xc-score`.** No
   hand-maintained coefficients; the library is the source of truth.

## Open questions (still to confirm)

1. **Solver compute budget.** Pick a `maxcycle`/time budget that balances
   accuracy vs responsiveness, especially for bulk Recalculate on mobile.
   Default to "run to completion" and only cap if real tracks feel slow.
2. **Figure-8 handling.** Confirm the "exclude any sustained high turn-rate fix"
   heuristic is acceptable, since it also trims partial-circle edges from ridge
   runs.
