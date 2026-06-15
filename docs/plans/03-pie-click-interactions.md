# 03 · Clickable pies — filter + cross-chart metric

**Requests:**

- **#4** "When selecting a pie chart category, apply a filter. E.g. clicking
  location A in the location pie adds a `Site = A` filter."
- **#5** "If I click *thermalling* in the time-split dashboard, **no** filter is
  applied to the table — only to the location pie. E.g. if I thermalled 2 h in
  location A and 3 h in B, while total airtime is 5 h in each, the location pie
  shows 50/50 before clicking and **2:3** after clicking thermalling."

**Depends on:** [01](01-dashboard-filter-scoping.md) and
[02](02-location-pie-chart.md).
**Effort:** medium.

## The two click behaviours are different

This is the crux. Same gesture (click a slice), two outcomes depending on which
pie:

| Click target | Effect on the **table filter** | Effect on the **location pie** |
|---|---|---|
| **Location pie** slice (a site) | adds/toggles `Site = <site>` | re-scopes with everything else (becomes 100% that site) |
| **Time-breakdown** slice (thermal / ridge / glide / other) | **none** | re-weights each site by that phase's time |

So the location pie answers "where", and the time pie acts as a **metric
selector** for the location pie ("where, measured by thermal time").

## State model

Two independent pieces of state in `FlightsListScreen`:

1. **Table filter** — already persisted in `settings.filters`
   ([`FlightsListScreen.tsx:101`](../../packages/app/src/screens/FlightsListScreen.tsx#L101)).
   Location-slice clicks mutate this via the existing `persistSettings`.
2. **Active site metric** — *ephemeral UI state*, not persisted:
   `const [siteMetric, setSiteMetric] = useState<SiteMetric>("airtime")`.
   (`SiteMetric` from [`doc 02`](02-location-pie-chart.md) Step C:
   `airtime | thermal | ridge | glide | other`.)

Keep `siteMetric` out of `settings` — it's a transient view toggle, like sort
direction on a header, not a saved preference.

## Behaviour #4 — location slice → table filter

Add `onSegmentClick(site)` to `SiteBreakdownChart` (it already flows from
`DonutBreakdown`, doc 02 Step A). In `FlightsListScreen`:

```ts
function toggleSiteFilter(site: string) {
  const others = settings.filters.filter((f) => f.field !== "site");
  const current = settings.filters.find((f) => f.field === "site");
  const alreadyThis = current?.op === "equals" && current.value === site;
  const next = alreadyThis ? others : [...others, { field: "site", op: "equals", value: site }];
  persistSettings({ ...settings, filters: next });
}
```

- **Toggle:** clicking the already-active site clears the site filter — otherwise
  the pie collapses to 100% and there's no obvious way back from the chart.
- **Single site rule:** replace any existing `site` rule rather than stacking
  two contradictory ones.
- Because doc 01 made the dashboard filter-scoped, after the click the time pie
  *and* the location pie both re-scope to that site. That's expected.

### ⚠️ The "No site" slice — known gap

`makeFilterFn` treats `equals` with an **empty value as "match anything"**
([`FlightsTable.tsx:126`](../../packages/app/src/components/FlightsTable.tsx#L126)):

```ts
if (op === "equals") return value === "" || String(raw).toLowerCase() === String(value).toLowerCase();
```

So `Site = ""` cannot mean "flights with no site". Options:

- **(a)** Make the "No site" slice non-clickable (simplest; ship this first).
- **(b)** Add an `isEmpty` filter op to the model + `makeFilterFn` + the
  `FilterBar` UI, and emit it for the "No site" slice.

Recommend (a) for v1, note (b) as a follow-up. Flag this in the PR so the
limitation is intentional, not a bug.

## Behaviour #5 — time slice → location-pie metric

Add `onSegmentClick(key)` to `TimeBreakdownChart` (keys are
`thermal | ridge | glide | other`,
[`TimeBreakdownChart.tsx:20`](../../packages/ui/src/components/TimeBreakdownChart.tsx#L20)).
In `FlightsListScreen`:

```ts
function selectSiteMetric(phaseKey: string) {
  setSiteMetric((m) => (m === phaseKey ? "airtime" : (phaseKey as SiteMetric)));
}
```

- Clicking a phase sets `siteMetric` to that phase; clicking it again resets to
  `airtime`. **No `settings.filters` change** — the table is untouched.
- The location pie is rebuilt with `siteBreakdown(filtered, siteMetric)`
  (doc 02 Step C). With the worked example — A: airtime 5 h / thermal 2 h,
  B: airtime 5 h / thermal 3 h:
  - `siteMetric = "airtime"` → A 5, B 5 → 50/50.
  - `siteMetric = "thermal"` → A 2, B 3 → **40/60 (2:3)**. ✔ matches the request.

### Visual feedback (so the cross-link is legible)

- Highlight the active phase slice in the time pie (`DonutBreakdown.activeKey`
  controlled by `siteMetric`, doc 02 Step A).
- Change the location pie's centre/title to reflect the metric, e.g.
  `"by site"` → `"thermal · by site"`. Reuse the phase labels already defined in
  `TimeBreakdownChart`'s `values` array.
- Provide an obvious reset: clicking the active phase again, **or** a small
  "Airtime ▾"/"× thermal" chip above the location pie. Without a visible reset,
  users get stuck wondering why the location pie "looks wrong".

## Wiring summary

```
FlightsListScreen
 ├─ siteMetric (useState)               // ephemeral
 ├─ filtered = applyFilters(...)        // doc 01
 ├─ TimeBreakdownChart
 │     breakdown = timeBreakdown(filtered)
 │     activeKey = siteMetric (if a phase)
 │     onSegmentClick = selectSiteMetric        // #5  → metric, no filter
 └─ SiteBreakdownChart
       data = siteBreakdown(filtered, siteMetric)
       activeKey = site filter value (if any)
       onSegmentClick = toggleSiteFilter        // #4  → table filter
```

## Edge cases

- **`other` as a metric** has no single record field — it's
  `airtime − thermal − ridge − glide` per record (doc 02 Step C handles it).
  Clamp at ≥ 0 to avoid negative slices from rounding.
- **Filter + metric together:** filter `Site = A` *and* metric `thermal` → a
  one-slice location pie showing A's thermal time vs A's airtime in the centre.
  Coherent; just confirm the centre % uses the filtered airtime as denominator.
- **Keyboard parity:** the donut segments are already focusable with
  `tabIndex={0}` and hover handlers
  ([`TimeBreakdownChart.tsx:64`](../../packages/ui/src/components/TimeBreakdownChart.tsx#L64));
  add `onKeyDown` (Enter/Space → the same `onSegmentClick`) so clicking isn't
  mouse-only.
- **Touch:** on mobile the donut's hover-to-highlight maps to tap; make sure a
  tap that triggers `onSegmentClick` doesn't also get swallowed by the
  focus/hover handlers. Test on a device.

## Test

- `npm run typecheck`.
- Manual matrix:
  - Click location A → `Site = A` chip appears in the filter bar, table + both
    pies narrow to A; click A again → filter clears.
  - Click the thermal slice → table unchanged; location pie re-weights to
    thermal time; centre/legend label updates; click thermal again → back to
    airtime.
  - Reproduce the 2 h/3 h vs 5 h/5 h example and confirm 50/50 → 2:3.
  - "No site" slice is inert (v1) — document why.
