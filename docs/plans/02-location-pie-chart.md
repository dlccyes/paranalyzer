# 02 · Location (site) pie chart on the main dashboard

**Request:** "Add a pie chart for locations in the main dashboard."

**Depends on:** [01](01-dashboard-filter-scoping.md) (needs the shared `filtered`
list so the location pie is also filter-scoped).
**Effort:** medium.

## Goal

Next to the time-breakdown donut, show a second donut that splits **airtime by
site**, scoped to the filtered flights. This is also the surface that doc 03
makes clickable.

## Current state

- The dashboard panel renders a single `TimeBreakdownChart`
  ([`FlightsListScreen.tsx:111`](../../packages/app/src/screens/FlightsListScreen.tsx#L111)).
- `TimeBreakdownChart` is a self-contained SVG donut + legend + hover readout,
  hard-coded to four phase segments
  ([`TimeBreakdownChart.tsx`](../../packages/ui/src/components/TimeBreakdownChart.tsx)).
- Phase colours come from `PHASE_COLORS` in core; there is **no** per-site
  colour palette yet.

## Design

### Step A — extract a generic donut (recommended)

`TimeBreakdownChart` already contains everything a site pie needs (donut maths,
hover/focus highlighting, centre readout, legend). Rather than clone ~100 lines,
extract a presentational `DonutBreakdown` in `packages/ui` and have both charts
render it.

`packages/ui/src/components/DonutBreakdown.tsx`:

```ts
export interface DonutSegment { key: string; label: string; value: number; color: string; }

interface Props {
  segments: DonutSegment[];          // already filtered to value > 0, pre-sorted
  total: number;                     // denominator for the % and centre
  formatValue: (n: number) => string;// e.g. formatDurationHM
  centerLabel: string;               // "airtime", "by site", …
  onSegmentClick?: (key: string) => void;   // used by doc 03; optional here
  activeKey?: string | null;         // controlled highlight (doc 03); optional
}
```

Move the SVG/legend/hover code out of `TimeBreakdownChart` into `DonutBreakdown`.
`TimeBreakdownChart` keeps its `TimeBreakdown` prop and its phase→segment mapping
([`TimeBreakdownChart.tsx:20`](../../packages/ui/src/components/TimeBreakdownChart.tsx#L20))
but delegates rendering to `DonutBreakdown`. This keeps the existing detail-screen
and list-screen call sites working unchanged. Export `DonutBreakdown` +
`DonutSegment` from [`packages/ui/src/index.ts`](../../packages/ui/src/index.ts).

> If we'd rather not touch `TimeBreakdownChart` yet, a straight clone into
> `SiteBreakdownChart` works too — but the extraction pays off immediately in
> doc 03, which needs click handling on *both* pies.

### Step B — `SiteBreakdownChart`

`packages/ui/src/components/SiteBreakdownChart.tsx` — thin wrapper over
`DonutBreakdown`:

- Input: the per-site aggregation (see Step C) → maps to `DonutSegment[]`.
- `formatValue = formatDurationHM` (same unit as the time pie, since the default
  metric is airtime).
- `centerLabel` = `"by site"` (doc 03 will swap this to e.g. "thermal by site").

### Step C — aggregation helper

In `packages/app` (data layer, not ui), e.g. `data/breakdown.ts`:

```ts
export type SiteMetric = "airtime" | "thermal" | "ridge" | "glide" | "other";

export function siteBreakdown(flights: FlightRecord[], metric: SiteMetric) {
  // group by site (empty/undefined → "No site"); sum the metric field per record
  // metric→field: airtime|timeInThermal|timeInRidge|timeInGlide;
  //   "other" = max(0, airtime - thermal - ridge - glide)
  // return [{ site, value }] sorted desc
}
```

`metric` is `"airtime"` for this doc; doc 03 uses the other values. Keeping the
parameter now avoids a churn later.

### Step D — colours for sites

Sites are open-ended, so assign deterministically:

- Add a fixed palette (8–12 distinct hues) in core (`SITE_PALETTE` alongside
  `PHASE_COLORS`) or in ui.
- Assign by **sorted site name → index** so a given site keeps its colour across
  renders. Reserve a neutral grey (reuse `OTHER_COLOR`,
  [`TimeBreakdownChart.tsx:15`](../../packages/ui/src/components/TimeBreakdownChart.tsx#L15))
  for "No site" and for the "Other" overflow bucket (Step F).

### Step E — layout

The dashboard panel currently holds one chart. Put the two donuts in a responsive
two-up grid:

- Wrap both in a `.dashboard-charts` flex/grid container in
  `FlightsListScreen`'s `<details>` panel
  ([`:111`](../../packages/app/src/screens/FlightsListScreen.tsx#L111)).
- Add CSS in [`shell.css`](../../packages/app/src/shell.css): two columns on
  wide screens, stack to one column under ~640px (mirror the existing
  `@media (max-width: 860px)` pattern in
  [`styles.css:465`](../../packages/ui/src/styles.css#L465)).

### Step F — too many sites

Cap the pie to the top **N** sites (e.g. 6) by value and fold the rest into a
single grey **"Other"** slice, so a pilot with 30 sites still gets a readable
chart. N is a constant; the legend lists the same buckets.

## Edge cases

- **No sites at all** (fresh user / all "No site") → a single "No site" slice.
  Fine; arguably hide the location pie until ≥1 record has a site — decide during
  build.
- **Single site** → one full ring at 100%.
- Empty filtered set → mirror the time pie's empty state.

## Test

- `npm run typecheck`.
- Manual: with flights across ≥2 sites, the location donut shows the airtime
  split; applying a `Site =` filter collapses it to that one site (proves it
  rides on doc 01's `filtered` list).

## Out of scope

- Click-to-filter and the thermal/ridge/glide metric switch — that's
  [doc 03](03-pie-click-interactions.md). This doc only adds a *static*,
  filter-scoped, airtime-weighted location pie.
