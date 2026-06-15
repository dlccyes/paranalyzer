# 01 · Scope the dashboard to the active filter

**Request:** "Pie chart should be local to filter — the pie chart is for the
filtered records, not always all track logs."

**Status:** foundation for the whole dashboard epic (docs 02, 03 depend on it).
**Effort:** small.

## Problem

The list-screen dashboard always summarises **every** flight, even when the
table is filtered. Add a `Site = Woodrat` filter and the table narrows, but the
time-breakdown donut keeps showing all-time totals.

## Why — current behaviour

- `timeBreakdown` is reduced from the raw `flights` array, ignoring
  `settings.filters` —
  [`FlightsListScreen.tsx:60`](../../packages/app/src/screens/FlightsListScreen.tsx#L60).
- The only place filters are actually applied is **inside** the table:
  - `makeFilterFn(rule)` builds a per-rule predicate —
    [`FlightsTable.tsx:119`](../../packages/app/src/components/FlightsTable.tsx#L119).
  - `filteredData = flights.filter(rule.every(...))` —
    [`FlightsTable.tsx:177`](../../packages/app/src/components/FlightsTable.tsx#L177).

So the filtered set is private to `FlightsTable` and the dashboard never sees it.

## Design

Lift filtering up so there is **one filtered list**, computed in
`FlightsListScreen`, shared by the dashboard and the table.

```
FlightsListScreen
  flights ─┐
           ├─ applyFilters(flights, settings.filters) ──► filtered
           │                                                 │
           │                       ┌─────────────────────────┤
           ▼                       ▼                         ▼
     (unchanged)            TimeBreakdownChart           FlightsTable
                            (now from `filtered`)        (receives `filtered`,
                                                          no longer filters)
```

### 1. Extract a shared filter helper

New file `packages/app/src/data/filter.ts`:

```ts
import type { FlightRecord, FilterRule } from "./model";

export function makeFilterFn(rule: FilterRule): (rec: FlightRecord) => boolean { /* moved verbatim from FlightsTable */ }

export function applyFilters(flights: FlightRecord[], filters: FilterRule[]): FlightRecord[] {
  return flights.filter((rec) => filters.every((rule) => makeFilterFn(rule)(rec)));
}
```

Export both from [`packages/app/src/index.ts`](../../packages/app/src/index.ts)
(the table and the screen both import from `@paranalyzer/app` internals already).

### 2. `FlightsListScreen`

- `const filtered = useMemo(() => applyFilters(flights, settings.filters), [flights, settings.filters]);`
- Derive `timeBreakdown` from `filtered` instead of `flights`
  ([`:60`](../../packages/app/src/screens/FlightsListScreen.tsx#L60)).
- Pass `filtered` to `<FlightsTable flights={filtered} … />` and **drop** the
  `filters` prop it no longer needs.
- Keep `gliders` derived from the full `flights` (the filter UI's dropdown should
  still list every glider, not just the ones surviving the current filter).

### 3. `FlightsTable`

- Delete the internal `filteredData` memo and the `filters` prop; feed
  `data: flights` straight into the table.
- Move `makeFilterFn` out to `data/filter.ts` (import if still referenced; it is
  not, once the memo is gone).
- The footer totals use `getFilteredRowModel()`
  ([`:34`](../../packages/app/src/components/FlightsTable.tsx#L34)). With no
  TanStack column filters configured, that returns all passed rows, so
  "Total · N flights" automatically reflects the already-filtered list. No change
  needed.

## Edge cases

- **Empty filtered set.** `TimeBreakdownChart` with `airtime = 0` renders the
  base ring and "0:00 airtime"
  ([`TimeBreakdownChart.tsx:17`](../../packages/ui/src/components/TimeBreakdownChart.tsx#L17)).
  Acceptable; optionally show a small "No flights match" hint in the panel.
- **`glide` may be `null`** on legacy records — the existing reducer already
  coalesces with `?? 0` ([`:65`](../../packages/app/src/screens/FlightsListScreen.tsx#L65)).
  `applyFilters` must preserve the current `null`-guard in `makeFilterFn`
  ([`FlightsTable.tsx:124`](../../packages/app/src/components/FlightsTable.tsx#L124)).

## Test

- `npm run typecheck`.
- Manual: add a `Site =` filter → donut totals and the table both narrow to the
  same set; clearing the filter restores all-time totals.

## Out of scope / follow-ups

- Persisting a "dashboard ignores filter" toggle — not requested.
- The location pie (doc 02) and click-to-filter (doc 03) assume this `filtered`
  list exists; do this first.
