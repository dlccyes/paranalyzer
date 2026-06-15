# Paranalyzer — Bug-fix & Feature Plan

Status: **planning only — no code changes yet**
Scope: Android mobile app (`apps/mobile`) + shared UI (`packages/ui`), plus one web-visible change.

This document addresses four reported issues:

| # | Issue | Type | Severity | Primary file(s) |
|---|-------|------|----------|-----------------|
| 1 | App freezes after tapping ⚙️ / **Filter** / **Columns**, or long-pressing a row | Bug | **Critical** (app unusable) | `apps/mobile/src/components/FlightsTable.tsx` |
| 2 | **Site** should be a user-editable single-select (add / edit / remove options) | Feature | Medium | `data/model.ts`, `data/db.ts`, new `SiteSelect`, `FlightDetailScreen`, `SettingsScreen` |
| 3 | Show **total time in thermal** and **time ridge soaring** on the detail page **and** the web app | Feature | Low | `packages/ui/src/components/SummaryPanel.tsx` |
| 4 | Add a **Delete** button for a track | Feature | Low | `apps/mobile/src/screens/FlightDetailScreen.tsx` |

Recommended implementation order: **1 → 4 → 3 → 2** (unblock the app first; ship the small wins; finish with the larger feature).

---

## Issue 1 — App freeze (CRITICAL)

### 1.1 Root cause (confirmed)

The freeze is a **React infinite re-render loop** ("Maximum update depth exceeded") originating in
[`FlightsTable.tsx`](apps/mobile/src/components/FlightsTable.tsx). It is the textbook TanStack Table v8 footgun: **`data` and `columns` must be stable references across renders.** Here they are rebuilt from scratch on *every* render:

```ts
// apps/mobile/src/components/FlightsTable.tsx  (current)
const columnOrder: ColumnOrderState = columns.map((c) => c.id);                       // new array every render
const visibility: VisibilityState = Object.fromEntries(columns.map((c) => [c.id, c.visible])); // new object every render
const filteredData = flights.filter((rec) => filters.every((rule) => makeFilterFn(rule)(rec))); // new array every render

const table = useReactTable({
  data: filteredData,            // ← unstable reference
  columns: buildColumns(units),  // ← unstable reference (new array AND new column objects every render)
  state: { sorting, columnVisibility: visibility, columnOrder },
  ...
});
```

When the table receives a new `data`/`columns`/`state` identity, TanStack reconciles its internal column/row model and can dispatch a state update; that update re-renders the component, which rebuilds `data`/`columns`/`state` again → new identities → reconcile again → **infinite loop**. The JS main thread saturates and the WebView stops responding to all touch input → "everything becomes unresponsive."

### 1.2 Why those four specific triggers

The first render is fine (you see the flight list). The loop only starts on the **first re-render of `FlightsTable`**. Every reported trigger re-renders the parent `FlightsListScreen`, which re-renders `<FlightsTable>`:

- **Filter** → `setShowFilters(v => !v)`
- **Columns** → `setShowColumnSheet(true)`
- **⚙️ / "…"** → `navigate("/settings")` (re-renders the list before route change)
- **Long-press a row** → `setContextMenu({...})` inside `FlightsTable` itself

So the trigger is incidental — *any* state change that re-renders the table starts the loop. This also explains why a brand-new install with **zero flights** can still freeze (the empty table re-renders the same way).

### 1.3 Fix

Memoize the three unstable inputs so their identity is stable between renders. In
[`FlightsTable.tsx`](apps/mobile/src/components/FlightsTable.tsx):

```ts
import { useMemo, useState } from "react";

// inside FlightsTable(...)
const tableColumns = useMemo(() => buildColumns(units), [units]);

const columnOrder = useMemo<ColumnOrderState>(
  () => columns.map((c) => c.id),
  [columns],
);

const columnVisibility = useMemo<VisibilityState>(
  () => Object.fromEntries(columns.map((c) => [c.id, c.visible])),
  [columns],
);

const filteredData = useMemo(
  () => flights.filter((rec) => filters.every((rule) => makeFilterFn(rule)(rec))),
  [flights, filters],
);

const table = useReactTable({
  data: filteredData,
  columns: tableColumns,
  state: { sorting, columnVisibility, columnOrder },
  // ...unchanged
});
```

Notes for the implementer:

- `columns` here is the `ColumnConfig[]` prop (the visibility/order config), **not** the TanStack column defs. Keep the rename to `tableColumns` for the built defs to avoid shadowing confusion.
- `buildColumns` / `makeFilterFn` / the module-level `createColumnHelper` are already render-safe; no change needed there.
- The outer `state: {…}` object literal being new each render is fine — TanStack reads its inner fields, which are now stable.

### 1.4 Defensive hardening (recommended, same PR)

1. **Add a React error boundary** at the mobile app root so a future render error shows a message instead of a frozen/blank screen. New file `apps/mobile/src/components/ErrorBoundary.tsx`, wrap `<RouterProvider>` in [`App.tsx`](apps/mobile/src/App.tsx). This is the reason the bug shipped silently — builds were verified but a render-loop produces no build/type error.
2. **Remove the unused `onColumnChange`** from the destructure mismatch: `Props` declares `onColumnChange` but the function body never uses it (column edits flow through `ColumnConfigSheet` in the parent). Either wire it or drop it from the interface to avoid confusion. Minor.
3. **`window.confirm` reliance** (used by the row context-menu delete and Drive restore): Capacitor's Android WebView *does* support `confirm()`/`alert()` via native dialogs, so this is not the freeze. But for consistency, see Issue 4 for a custom in-app confirm; optional here.

### 1.5 Verification

- Reproduce on an emulator/device build (`npm run build:mobile && npx cap run android`) **before** the fix to confirm the freeze, then after to confirm it's gone.
- Manual matrix: with **0 flights** and with **≥3 flights**, tap Filter, Columns, ⚙️, long-press a row, sort by a column, toggle column visibility, add/remove a filter. None should hang.
- Watch `chrome://inspect` console for "Maximum update depth exceeded" — must be absent after the fix.

### 1.6 Acceptance criteria

- Opening Filter, Columns, Settings, and the row context menu never freezes the app.
- Sorting, filtering, and column show/hide/reorder all work and persist.
- No "Maximum update depth exceeded" warning in the WebView console.

---

## Issue 4 — Delete button for a track

(Listed before 3/2 because it's small and partly overlaps the Issue 1 area.)

### 4.1 Current state

Deletion exists **only** as a long-press context menu in the list ([`FlightsTable.tsx`](apps/mobile/src/components/FlightsTable.tsx)) — undiscoverable and tied to the broken interaction from Issue 1. There is **no** delete affordance on the flight detail page.

`deleteFlight(id)` ([`db.ts`](apps/mobile/src/data/db.ts)) and `deleteTrack(trackRef)` ([`trackStore.ts`](apps/mobile/src/data/trackStore.ts)) already exist and are correct.

### 4.2 Fix — add an explicit Delete on the detail page

In [`FlightDetailScreen.tsx`](apps/mobile/src/screens/FlightDetailScreen.tsx):

- Import `deleteFlight` from `../data/db` and `deleteTrack` from `../data/trackStore`.
- Add a **Delete** button (red, `btn-danger`) in the header (right side) or as a footer action below the `NoteEditor`.
- Handler:

```ts
const handleDelete = async () => {
  if (!rec) return;
  const ok = await confirmDialog("Delete this flight permanently?"); // see 4.3
  if (!ok) return;
  await deleteTrack(rec.trackRef);
  await deleteFlight(rec.id);
  navigate("/", { replace: true });
};
```

The list screen already reloads from `loadDb()` on mount, so returning to `/` reflects the deletion with no extra wiring.

### 4.3 Confirm dialog (recommended)

Add a small in-app confirm instead of `window.confirm` for reliable styling on Android. Two options:

- **Minimal:** reuse the existing context-menu/backdrop CSS to render a centered confirm card with Cancel / Delete.
- **Pragmatic:** keep `window.confirm` for v1 (works in Capacitor WebView) and replace later.

Recommendation: ship a reusable `ConfirmDialog` component (`apps/mobile/src/components/ConfirmDialog.tsx`) and use it for both this delete and the row context-menu delete, so all destructive actions share one trustworthy flow.

### 4.4 Acceptance criteria

- The detail page has a clearly labeled Delete button.
- Deleting removes both the DB record and the stored track file, then returns to the list, which no longer shows the flight.
- A confirmation step prevents accidental deletion.

---

## Issue 3 — Show time-in-thermal & time-ridge-soaring (detail page + web)

### 3.1 Key insight — one change covers both apps

Both the web app and the mobile detail page render the **same** `AnalysisView` → `SummaryPanel`
([web `App.tsx`](apps/web/src/App.tsx) line 78; [mobile `FlightDetailScreen.tsx`](apps/mobile/src/screens/FlightDetailScreen.tsx)). The values already exist on `flight.stats`:

- `stats.timeInThermal` (seconds) — already computed in [`stats.ts`](packages/core/src/analysis/stats.ts)
- `stats.timeInRidge` (seconds)

So editing [`SummaryPanel.tsx`](packages/ui/src/components/SummaryPanel.tsx) **once** satisfies "detail page **and** web app." No core or per-app changes needed.

### 3.2 Fix

Add two tiles to the `stat-grid`, right after the Airtime tile, with a percentage-of-airtime sub-label:

```tsx
const pct = (s: number) =>
  stats.airtime > 0 ? `${Math.round((s / stats.airtime) * 100)}% of airtime` : undefined;

// ...inside <div className="stat-grid">, after Airtime:
{stat("Time in thermal", formatDuration(stats.timeInThermal), pct(stats.timeInThermal))}
{stat("Time ridge soaring", formatDuration(stats.timeInRidge), pct(stats.timeInRidge))}
```

`formatDuration` is already imported in `SummaryPanel`. Guard against `airtime === 0` (shown above) to avoid `NaN%`.

### 3.3 Notes

- These two fields are also already available as **table columns** (`timeInThermal`, `timeInRidge`) on the list and are in the default visible set ([`model.ts`](apps/mobile/src/data/model.ts)). No change there.
- No DB migration: the mobile detail page re-analyzes the raw track on open, so the values are always live.

### 3.4 Acceptance criteria

- The summary panel on **both** the web app and the mobile detail page shows "Time in thermal" and "Time ridge soaring" with sensible values and a % sub-label.
- Zero-airtime / edge tracks don't render `NaN`.

---

## Issue 2 — Editable single-select "Site" with managed options

### 2.1 Current state

`site` is read-only, auto-filled from the track's metadata in
[`record.ts`](packages/core/src/record.ts) (`site: meta.site`). Most tracks (IGC/GPX/KML) carry **no** site name, so it's usually blank. The original spec said "no manual editing except Note" — **this issue explicitly overrides that for `site`.**

### 2.2 Design overview

Introduce a **global list of site options** stored in `Settings`, plus a **per-flight `site`** that the user selects from that list. The user can add, rename, and remove options.

- `Settings.sites: string[]` — the managed option list (e.g., `["Woodrat Mtn", "Pine Mtn", "Rat"]`).
- `FlightRecord.site` (already exists) — the chosen value for that flight; may be empty.
- Detail page gets a **single-select** that also allows quick-add and full manage (add/rename/remove).

### 2.3 Data-model changes — [`apps/mobile/src/data/model.ts`](apps/mobile/src/data/model.ts)

```ts
export interface Settings {
  columns: ColumnConfig[];
  filters: FilterRule[];
  sort: SortRule;
  units: "metric" | "imperial";
  sites: string[];            // NEW — managed option list
  lastBackupAt?: number;
  drive?: { connected: boolean };
}

export const DEFAULT_SETTINGS: Settings = {
  // ...existing...
  sites: [],                  // NEW
};
```

Migration: `loadDb()` already spreads `{ ...DEFAULT_SETTINGS, ...doc.settings }`, so `sites` defaults to `[]` for existing DBs. **One-time backfill** (recommended): on load, union any distinct non-empty `flight.site` values into `settings.sites` so previously-imported names appear as options.

### 2.4 DB helpers — [`apps/mobile/src/data/db.ts`](apps/mobile/src/data/db.ts)

```ts
export async function updateSite(id: string, site: string): Promise<void> {
  const doc = await loadDb();
  const rec = doc.flights.find((f) => f.id === id);
  if (rec) rec.site = site;
  await saveDb(doc);
}

// Option-list management (operate on settings.sites):
export async function addSiteOption(name: string): Promise<void> { /* trim, dedupe, push, saveSettings */ }

export async function renameSiteOption(oldName: string, newName: string): Promise<void> {
  // rename in settings.sites AND cascade: every flight whose site === oldName → newName
}

export async function removeSiteOption(name: string): Promise<void> {
  // remove from settings.sites; for flights using it, set site = "" (do NOT delete the flight)
}
```

Cascade rules (state them explicitly in code comments):
- **Rename** updates the option list and every flight currently set to the old name.
- **Remove** deletes the option and clears `site` on affected flights (flights are never deleted as a side effect).

### 2.5 UI

**a) `SiteSelect` component** — new `apps/mobile/src/components/SiteSelect.tsx`, used on the detail page:

- A `<select>` populated from `settings.sites`, plus a blank "—" option and the current `rec.site` (even if not in the list, so legacy values still display).
- A trailing **＋** button for quick-add: prompts for a name, calls `addSiteOption`, then selects it.
- A **"Manage sites…"** entry (or small gear) that opens a management sheet (reuse `.sheet`/`.sheet-backdrop` CSS from `ColumnConfigSheet`) listing each option with **rename** and **remove** actions → `renameSiteOption` / `removeSiteOption`.
- On selection change → `updateSite(rec.id, value)` and update local state.

**b) Wire into [`FlightDetailScreen.tsx`](apps/mobile/src/screens/FlightDetailScreen.tsx):** render `<SiteSelect>` near the `NoteEditor`. Load `settings` (it's already fetched for `units`) and pass `sites` + handlers; keep `settings` in local state so adds/renames re-render the picker.

**c) Optional: a "Sites" section in [`SettingsScreen.tsx`](apps/mobile/src/screens/SettingsScreen.tsx)** for managing the option list globally (same add/rename/remove handlers). Nice-to-have; the detail-page "Manage sites…" already satisfies the requirement.

### 2.6 Backup/restore

`exportBackup`/`importBackup` ([`backup.ts`](apps/mobile/src/data/backup.ts)) already serialize `settings` wholesale, so `settings.sites` and per-flight `site` are included automatically. No change required — just verify after implementing.

### 2.7 Auto-fill behavior on import

Keep auto-filling `site` from `meta.site` when present ([`record.ts`](packages/core/src/record.ts) is unchanged). After import, if a flight's auto-filled `site` is not yet an option, add it to `settings.sites` (in `importFlight.ts` or via the backfill in 2.3). User can then rename/remove as desired.

### 2.8 Acceptance criteria

- On the detail page, `site` is a single-select listing all managed options.
- User can add a new option, rename an option (cascading to flights using it), and remove an option (clearing it from affected flights without deleting them).
- Selected site persists across app restarts and is included in backups/restores.
- The list view's "Site" column and site filter reflect edited values.

---

## Cross-cutting notes

### Testing gap that let Issue 1 ship
Builds and type-checks pass, but **no runtime/on-device smoke test** was run — an infinite render loop is invisible to `tsc`/`vite build`. Add to the workflow checklist: after `build:mobile`, run the app on an emulator and exercise the list interactions (and ideally add a lightweight component test for `FlightsTable` rendering + re-render stability).

### Files touched (summary)
- **Issue 1:** `apps/mobile/src/components/FlightsTable.tsx` (+ new `ErrorBoundary.tsx`, wired in `App.tsx`).
- **Issue 4:** `apps/mobile/src/screens/FlightDetailScreen.tsx` (+ optional `ConfirmDialog.tsx`).
- **Issue 3:** `packages/ui/src/components/SummaryPanel.tsx` (covers web + mobile).
- **Issue 2:** `apps/mobile/src/data/model.ts`, `data/db.ts`, new `SiteSelect.tsx`, `FlightDetailScreen.tsx`, optional `SettingsScreen.tsx`; possibly `data/importFlight.ts` for option backfill.

### No changes required to
- `packages/core` analysis (thermal/ridge already computed; `record.ts` site auto-fill stays).
- CI workflows, Capacitor/Gradle config, web shell.

### Suggested PR breakdown
1. **PR1 — Critical fix:** Issue 1 (memoization) + error boundary. Ship immediately.
2. **PR2 — Quick wins:** Issue 4 (delete button) + Issue 3 (thermal/ridge stats).
3. **PR3 — Feature:** Issue 2 (editable site select + management).
