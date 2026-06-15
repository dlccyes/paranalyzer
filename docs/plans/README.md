# Paranalyzer — feature plans

Planning docs for the next batch of work. **No code in this folder** — each doc
describes the goal, the current behaviour (with `file:line` anchors), the
proposed design, and concrete implementation steps. Read order roughly matches
dependency order.

## Backlog → docs

| # | Request | Doc |
|---|---------|-----|
| 1 | Pie chart should be local to the filter (filtered records, not all logs) | [01-dashboard-filter-scoping.md](01-dashboard-filter-scoping.md) |
| 3 | Add a location (site) pie chart to the main dashboard | [02-location-pie-chart.md](02-location-pie-chart.md) |
| 4 | Clicking a pie category applies a filter (e.g. location A → `Site = A`) | [03-pie-click-interactions.md](03-pie-click-interactions.md) |
| 5 | Clicking a time-split slice re-weights the location pie, **not** the table | [03-pie-click-interactions.md](03-pie-click-interactions.md) |
| 2 | Manually add a log, including its attributes | [04-manual-add-log.md](04-manual-add-log.md) |
| 6 | Progress bar / loading animation for Drive import/export | [05-drive-progress-indicator.md](05-drive-progress-indicator.md) |
| 7 | Mobile: fix the "Paranalyzer" / Filter / Columns header overlap | [06-mobile-header-overlap.md](06-mobile-header-overlap.md) |

## How the pieces relate

Requests 1, 3, 4 and 5 are one coherent epic: **an interactive, filter-aware
dashboard**. They share a single foundational refactor and should land in order:

```
01  lift filtering out of FlightsTable        ← foundation for 1, 4, 5
    └─ 02  add the location pie (reuses the donut + the filtered set)
          └─ 03  make both pies clickable (filter + cross-chart metric)
```

The other three (2 manual add, 6 Drive progress, 7 mobile header) are
independent and can be done in any order, in parallel with the dashboard epic.

## The shared foundation (read before 01/03)

Today the **filter predicate lives inside `FlightsTable`** and is applied only to
the table's own data:

- `makeFilterFn` + the `filteredData` memo —
  [`FlightsTable.tsx:119`](../../packages/app/src/components/FlightsTable.tsx#L119)
  and [`:177`](../../packages/app/src/components/FlightsTable.tsx#L177).
- The dashboard's `timeBreakdown` is computed from the **unfiltered** `flights`
  array — [`FlightsListScreen.tsx:60`](../../packages/app/src/screens/FlightsListScreen.tsx#L60).

So the dashboard ignores the filter. The fix (doc 01) is to extract the filter
logic into a shared helper, evaluate it once in `FlightsListScreen`, and feed the
**same filtered list** to both the dashboard and the table. Every later dashboard
feature builds on that one filtered list.

## Architecture cheat-sheet

| Layer | Path | Role |
|-------|------|------|
| `@paranalyzer/core` | `packages/core/src` | Pure analysis, types, units, `PHASE_COLORS`, `FlightRecord` |
| `@paranalyzer/ui` | `packages/ui/src` | Presentational React — charts, tables, map, barogram |
| `@paranalyzer/app` | `packages/app/src` | Screens, data layer, platform-bound components |
| web / mobile | `apps/web`, `apps/mobile` | Platform adapters (storage, files, Drive) + entry |

Rule of thumb honoured by these plans: **dumb visuals go in `ui`, data and
wiring go in `app`, platform I/O goes behind the `PlatformAdapter`**
([`platform.ts`](../../packages/app/src/platform.ts)).
