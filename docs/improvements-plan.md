# Paranalyzer — Improvements Plan

Planning doc for a batch of feature requests and bug fixes across the **web**
(`apps/web`) and **mobile** (`apps/mobile`, Capacitor) apps. No code is changed
here — this is the implementation map.

---

## 0. Cross-cutting architecture notes (read first)

These shape almost every task below.

### 0.1 The web and mobile apps duplicate their app-layer code

`apps/web/src` and `apps/mobile/src` are **near-identical copies**, not a shared
package. The following files are byte-for-byte (or nearly) the same in both apps:

- `data/model.ts` (identical), `data/db.ts`, `data/backup.ts`, `data/drive.ts`,
  `data/importFlight.ts`, `data/trackStore.ts`
- `components/FilterBar.tsx` (identical), `FlightsTable.tsx`,
  `ColumnConfigSheet.tsx`, `SiteSelect.tsx`, `ImportButton.tsx`, `NoteEditor.tsx`
- `screens/FlightsListScreen.tsx`, `FlightDetailScreen.tsx`, `SettingsScreen.tsx`

Only the genuinely platform-specific files differ (`importFlight.ts`,
`backup.ts`, `drive.ts`, `trackStore.ts`, `capacitor.config.ts`).

**Implication:** every "in both mobile and web" task below must be applied
**twice** — once per app — keeping the two copies in sync. The shared analysis,
parsing, formatting, and the flight-detail `AnalysisView` already live in
`packages/core` and `packages/ui`; changes to phase tables, wind badges, the map,
etc. are made once there.

> **Decided: this duplicated code will be extracted into a shared workspace
> package _first_ — see Task 0 (§1.1).** All subsequent "both apps" tasks (A–J)
> are then implemented **once** in the shared package. The per-task plans below
> are written against the shared package; the "(both)" file annotations become
> "(shared)" once Task 0 lands.

### 0.2 Settings & schema versioning

- `Settings` is persisted inside `DbDocument` (`localStorage` key
  `paranalyzer-db` on web; same key via Capacitor Preferences/localStorage on
  mobile — see `data/db.ts`).
- `loadDb()` already does `settings: { ...DEFAULT_SETTINGS, ...doc.settings }`,
  so **adding new optional `Settings` fields needs no migration** — old docs pick
  up the new default automatically.
- New **`FlightRecord`** fields are optional on read (`undefined` for old
  flights), so no migration is needed either, *unless* we want to backfill from
  the stored track (relevant to tasks B and C).
- `DB_SCHEMA_VERSION` is currently `1`. Bump it only if a destructive/irreversible
  migration is introduced (none of these tasks require that).

### 0.3 Where each layer lives

| Layer | Path | Shared? |
|-------|------|---------|
| Parsing (igc/gpx/kml) | `packages/core/src/parsers` | yes |
| Analysis pipeline | `packages/core/src/analysis` | yes |
| Formatting / units | `packages/core/src/units.ts` | yes |
| Flight record schema | `packages/core/src/record.ts` | yes |
| Flight-detail dashboard | `packages/ui/src/AnalysisView.tsx` + components | yes |
| List / filter / columns / settings | `apps/{web,mobile}/src` | **duplicated** |

---

## 1.1 Task 0 — Extract the duplicated app code into a shared package (do first)

**Goal:** stop maintaining two near-identical copies of the app layer. Move the
shared data layer, components, and screens into a workspace package; keep only
genuinely platform-specific code in each app, injected via a small **platform
adapter**.

**What's shared vs platform-specific (from reading both apps):**

| File | Status | Notes |
|------|--------|-------|
| `data/model.ts` | identical → **shared** | pure types/constants |
| `data/db.ts` | **shared w/ storage adapter** | mobile's version already branches `isNative` (Capacitor `Filesystem` ↔ `localStorage`); generalize that branch into an injected `StorageAdapter { readRaw, writeRaw }` |
| `data/backup.ts` | **mostly shared** | `createBackupJson` + `importBackup` are identical logic; only *delivering* the file differs (web `downloadJson` Blob ↔ mobile `Filesystem.writeFile`). Inject `saveBackupFile(name, json)` |
| `data/importFlight.ts` | **mostly shared** | `importOne` is identical; only *picking/reading* files differs (browser `<input>` ↔ `@capawesome/capacitor-file-picker`). Inject `pickTrackFiles(): Promise<{name,text}[]>` |
| `data/trackStore.ts` | **adapter** | web in-memory `Map` ↔ mobile Capacitor `Filesystem`. Inject a `TrackStore { saveTrack, readTrack, deleteTrack }` |
| `data/drive.ts` | **platform-specific** | totally different auth (GIS token client ↔ codetrix native). The Drive REST calls (`findBackupFile`/`uploadToDrive`/`restoreFromDrive`) are identical and *can* be shared behind an injected `getToken()`; the connect/disconnect/auth stays per-platform |
| `components/*` (FilterBar, FlightsTable, ColumnConfigSheet, SiteSelect, ImportButton, NoteEditor) | **shared** | pure React over the data layer |
| `screens/*` (FlightsList, FlightDetail, Settings) | **shared** | use `react-router-dom` (both already do) |
| `App.tsx`, `main.tsx`, `shell.css` | **shared** (CSS shared too) | each app keeps a thin entry that builds the adapter and mounts the shared root |
| `capacitor.config.ts`, Android project | mobile only | unchanged |

**Proposed structure:**

```
packages/
  app/                      # new: @paranalyzer/app
    src/
      data/ (model, db, backup, importFlight, drive-rest)
      components/ ...
      screens/ ...
      AppRoot.tsx           # router + <RouterProvider>
      platform.ts           # PlatformAdapter interface + React context
      shell.css
apps/web/src/
  main.tsx                  # builds web adapter, mounts <AppRoot adapter={...}>
  platform/ (storage, trackStore, filePicker, backupFile, drive-auth)
apps/mobile/src/
  main.tsx                  # builds mobile adapter, mounts <AppRoot adapter={...}>
  platform/ (storage, trackStore, filePicker, backupFile, drive-auth)
```

**`PlatformAdapter` interface (sketch):**

```ts
interface PlatformAdapter {
  storage: { readRaw(): Promise<string|null>; writeRaw(json: string): Promise<void> };
  tracks:  { saveTrack(id,ext,text): Promise<string>; readTrack(ref): Promise<string>; deleteTrack(ref): Promise<void> };
  pickTrackFiles(): Promise<{ name: string; text: string }[]>;
  saveBackupFile(name: string, json: string): Promise<void>;  // download (web) / write+share (mobile)
  drive?: {                                  // optional; gated in UI when absent
    connect(): Promise<void>; disconnect(): Promise<void>;
    getToken(): Promise<string>; isConnected(): boolean;
  };
}
```

`db.ts` becomes a singleton parameterized by `adapter.storage` (or holds a
module-level adapter set once at startup). The shared `drive-rest.ts` takes
`adapter.drive.getToken`; each app's `platform/drive-auth` implements `connect`
etc. (this is also where the mobile Drive fix from Task L lands).

**Migration steps:**
1. Create `packages/app` workspace (mirror `packages/ui` tsconfig/package.json;
   add to root `workspaces` — already globbed as `packages/*`).
2. Move `core`/`ui`-independent shared files in, define `PlatformAdapter` +
   context, refactor `db.ts`/`backup.ts`/`importFlight.ts`/`drive.ts` to use it.
3. Reduce each app's `src` to: `main.tsx`, `platform/*`, `capacitor.config.ts`
   (mobile). Delete the duplicated `data/`/`components/`/`screens/`.
4. Typecheck + build both apps (`npm run build:web`, `npm run build:mobile`).
5. Smoke-test web (import, filter, columns, detail, backup) and mobile.

**Effort:** L (foundational). **Risk:** medium — it's a move/refactor, not new
behavior; the win is every A–J task is then done once. **Do this before E and I**
(the two biggest UI tasks) at minimum; ideally before all of A–J.

> The rest of this doc still lists per-app file paths for clarity, but once
> Task 0 is done, "(both)" → one edit in `packages/app`.

---

## 1. Issue index

| # | Task | Apps | Primary layer | Effort |
|---|------|------|---------------|--------|
| 0 | **Extract shared app code into `packages/app`** (do first) | both | new workspace + platform adapter | L |
| A | Duplicate-track check on import (replace / keep both / cancel) | both | app data + import UI | M |
| B | XContest points as a field | both | core record + app model/table | M |
| C | Sites: auto-detect from IGC, auto-add as option, edit name | both | core parser + app data | S–M |
| D | Date format option in Settings (`DD.MM.YYYY` ⇄ `YYYY-MM-DD`) | both | core units + app settings/table | S |
| E | Filter redesign (modern UI, HH:MM airtime, units, enum pickers) | both | app FilterBar + model | L |
| F | Remove the dead "…" right of the 🪂 icon | both | app CSS/header | XS |
| G | Click a thermal/bad-turn/glide row → scroll map into view | both | `packages/ui` | S |
| H | Wind-direction arrow in the list "Wind dir" column | both | app FlightsTable (+ `packages/ui` Arrow) | XS |
| I | Drag-and-drop to reorder fields | both | app ColumnConfigSheet | M |
| J | "Remove all data" in Settings | both | app db + settings | S |
| K | **[mobile]** Export backup → `FILE_NOTCREATED` | mobile | `data/backup.ts` | XS |
| L | **[mobile]** Connect Google Drive → "something went wrong" | mobile | `data/drive.ts` + OAuth config | M |

Effort: XS < S < M < L. "both" = apply to `apps/web` **and** `apps/mobile`.

---

## 2. Task A — Duplicate-track check on import

**Goal:** when importing a track whose **start date/time** matches a flight
already in the DB, prompt **Replace / Keep both / Cancel** *before* uploading
(saving) it.

**Current state** (`apps/{web,mobile}/src/data/importFlight.ts`,
`components/ImportButton.tsx`): each picked file is parsed, analyzed, and
unconditionally `addFlight()`-ed. There is **no** duplicate detection. Note the
web and mobile importers differ in how they read file bytes (browser
`<input type=file>` vs `@capawesome/capacitor-file-picker`), but share
`importOne()`.

**Duplicate key:** use `FlightRecord.startTime` (epoch ms, from
`stats.start`). Two tracks of the same flight produce the same `startTime`.
Consider matching within a small tolerance (e.g. exact equality first;
optionally `±2 s` to absorb trimming differences) — **decide: exact match is
simplest and matches the request ("use start date/time as the check"). Go with
exact `startTime` equality.**

**Approach:**

1. In `importOne()`, after `analyzeFlight` + `buildFlightRecord` but **before**
   `saveTrack`/`addFlight`, check `listFlights()` for an existing record with the
   same `startTime`.
2. If found, surface a decision to the caller. Because `importOne` currently
   returns `{ id, error? }`, extend the result with a `duplicate?: { existingId }`
   signal, or (cleaner) split the flow: a pure `analyzeForImport()` that returns
   the built record + track text without persisting, and a separate
   `commitImport(rec, trackText, mode)`.
3. The **UI** (`ImportButton.tsx`) shows the prompt. Three outcomes:
   - **Replace** → `deleteFlight(existingId)` + `deleteTrack(oldRef)`, then save
     the new one (reuse a fresh id, or keep the existing id — keeping a new id is
     simpler; just delete the old record + track).
   - **Keep both** → save as a new record (new `id`/`trackRef`) alongside.
   - **Cancel** → skip this file (don't save track or record).
4. Order matters: **do not `saveTrack` until the user resolves the prompt**, so a
   cancelled import leaves zero residue. (Today `saveTrack` runs first inside
   `importOne` — reorder so analysis happens on the in-memory text, track is
   persisted only on commit.)

**Multi-file imports:** the picker allows many files. Prompt per duplicate; offer
an "apply to all" affordance is optional (nice-to-have, defer). Process
sequentially so prompts don't stack.

**UI component:** a small modal/sheet. Web can use a custom modal (project
already has `.sheet`/`.context-menu` styles); avoid `confirm()` since it only has
two buttons and we need three. Mobile reuses the same component.

**Files:** `data/importFlight.ts` (both), `components/ImportButton.tsx` (both),
maybe a new `components/DuplicateImportDialog.tsx` (both). Add a `findByStartTime`
helper to `data/db.ts` (both).

**Edge cases:** GPX/KML tracks may have a less precise start time; still keyed on
`startTime`. Files that fail to parse never reach the dup check (existing error
path unchanged).

---

## 3. Task B — XContest points as a field

**Goal:** add an "XContest points" value as a first-class flight field (visible
in the table, filterable, editable like Site/Note).

**Current state:** no points anywhere. IGC files do **not** contain XContest
points (it's a server-side score). So this is **user-entered** data, like the
note. (The README explicitly says XContest's points scoring is not reproduced.)

**Approach:**

1. **Schema** — add optional `xcontestPoints?: number` to `FlightRecord`
   (`packages/core/src/record.ts`). `buildFlightRecord` leaves it `undefined` on
   import (no source for it).
2. **Field registry** (`apps/{web,mobile}/src/data/model.ts`): add
   `"xcontestPoints"` to the `FieldId` union, `ALL_FIELDS`, and `FIELD_LABELS`
   (label e.g. `"XC points"`). Default visibility: off (add to neither
   `DEFAULT_VISIBLE` unless desired).
3. **Table** (`FlightsTable.tsx`, both): add a column rendering
   `r.xcontestPoints != null ? String(r.xcontestPoints) : "—"`. It's numeric, so
   it participates in `gte/lte/between` filters automatically via the existing
   `makeFilterFn` numeric branch.
4. **Editing** — points are user-entered, so add an editor on the
   **FlightDetailScreen** next to the Site selector (a number input that calls a
   new `updateXcontestPoints(id, n)` in `data/db.ts`, mirroring `updateSite`).
5. **Backup** — already serializes whole `FlightRecord`s, so it round-trips for
   free (`data/backup.ts`).

**Decision needed (low stakes):** is "points" purely manual, or do we want a
paste-from-XContest helper? Default: **manual number field.** Manual is enough to
satisfy "add xcontest points as a field"; a sync/scrape is out of scope (the app
is explicitly offline/no-backend).

**Files:** `record.ts`; `model.ts`, `FlightsTable.tsx`, `FlightDetailScreen.tsx`,
`db.ts` (all in both apps).

---

## 4. Task C — Sites: auto-detect, auto-add as option, edit name

**Goal:**
1. Site is auto-determined from the IGC site header and used for the flight.
2. That site is **also auto-added** to the managed site-options list.
3. Support **editing** a site name.

**Current state:**

- **Parsing** (`packages/core/src/parsers/igc.ts`): the H-record `site` is
  *already* parsed. `code = line.substring(2,5)` yields `"SIT"` for both
  `HFSITSITE:` and `HOSITSITE:` records (positions 2–4 are `S,I,T` in both), so
  the requested "HOSITSite" case is already handled. It's stored as
  `meta.site` → `FlightRecord.site` via `buildFlightRecord`. ✅
- **Editing** already exists: `db.ts` has `renameSiteOption`, `removeSiteOption`,
  `addSiteOption`, `updateSite`; `SiteSelect.tsx` and the mobile `SettingsScreen`
  both expose add / rename (✏️) / remove. ✅ So **"support edit site name" is
  largely done** — verify it works end-to-end and is reachable from both apps
  (web exposes it via the flight detail "Manage" sheet; mobile via Settings).
- **The actual gap:** on import, the parsed `site` is written to the flight
  record but is **never added to `settings.sites`**. `importFlight.ts` does not
  call `addSiteOption`. So an imported site shows on the flight (SiteSelect line
  47 injects the current value as an option) but isn't a reusable option in the
  dropdown for other flights, and won't appear in the Settings sites list.

**Approach:**

1. In `importOne()` (`data/importFlight.ts`, both), after building the record, if
   `rec.site` is non-empty call `addSiteOption(rec.site)` so it joins the managed
   list. (`addSiteOption` already dedupes + sorts.)
2. Optionally backfill: a one-time pass that collects distinct `flight.site`
   values into `settings.sites` for existing DBs. Low priority — can be a button
   in Settings or run lazily in `loadDb`. **Default: just fix forward on import;
   skip backfill** (legacy values still render via SiteSelect's value-injection).
3. **GPX/KML:** confirm whether those parsers expose a site (they likely don't —
   `meta.site` undefined). No change needed; the auto-add is guarded by
   non-empty.
4. Edit-name parity is already in place: **both** apps expose add/rename/remove —
   web via `SiteSelect.tsx`'s "Manage" sheet (flight detail) **and** a Sites
   section in `SettingsScreen` (confirmed: web Settings has Units / Sites / Local
   backup / Google Drive / About sections, mirroring mobile). So "support edit
   site name" needs only verification, not new UI.

**Files:** `data/importFlight.ts` (both). Parser and Settings UI need **no**
change.

---

## 5. Task D — Date format option in Settings

**Goal:** a setting toggling date display between the current `DD.MM.YYYY` and
`YYYY-MM-DD`.

**Current state:** `formatDate()` in `packages/core/src/units.ts` hardcodes
`DD.MM.YYYY` (line 78–83). It's used by `SummaryPanel` (`packages/ui`) and
`FlightsTable` (both apps). There is no date-format setting.

**Approach:**

1. **Core:** extend `formatDate(epochMs, tzOffsetMinutes, fmt?: "dmy" | "ymd")`
   with a default of `"dmy"` (preserves current behavior / call sites). Add the
   `YYYY-MM-DD` branch. Keep it a pure param — do **not** read settings inside
   `core` (core is settings-agnostic).
2. **Settings model** (`data/model.ts`, both): add
   `dateFormat: "dmy" | "ymd"` to `Settings` with default `"dmy"` in
   `DEFAULT_SETTINGS`. No migration needed (§0.2).
3. **Plumb the choice to call sites:**
   - `FlightsTable` already receives `units`; pass `dateFormat` similarly (from
     `settings.dateFormat`) and forward to `formatDate`.
   - `AnalysisView`/`SummaryPanel` (`packages/ui`) take a `units` prop; add an
     optional `dateFormat` prop (default `"dmy"`) threaded from
     `FlightDetailScreen`.
4. **Settings UI:** a two-button toggle modeled on the existing Units toggle in
   `SettingsScreen` (both apps already have a Units section — add a "Date format"
   section next to it).

**Files:** `units.ts` (core), `SummaryPanel.tsx` + `AnalysisView.tsx` (ui),
`model.ts` + `FlightsTable.tsx` + `FlightDetailScreen.tsx` + `SettingsScreen.tsx`
(both apps).

---

## 6. Task E — Filter redesign

**Goal:** make filtering modern and usable:
- Modern visual design (current one is "ugly and oldish").
- **Airtime** entered as **HH:MM**, not raw seconds.
- **Value filters** (track/straight/etc.) show **units**.
- **Enum filters** (Site, Glider) offer **selectable options** instead of a free
  text box.

**Current state** (`components/FilterBar.tsx`, identical in both apps;
`FlightsTable.tsx` holds `makeFilterFn`):

- Rules are `{ field, op, value }`. `opsFor()` buckets fields into TEXT
  (`contains/equals`), DATE (`dateOnOrAfter/Before`), else numeric
  (`gte/lte/between`).
- Inputs are bare `<select>` + `<input type=number|text|date>`. Op labels are raw
  enum strings (`gte`, `lte`…). No units, no enum pickers, durations are raw
  seconds.
- Values stored/compared in **base units**: airtime/time in **seconds**,
  distances in **meters**, speeds in **m/s**, vario in **m/s**, altitude in
  **meters** (see `FlightRecord` + `makeFilterFn` which reads the raw numeric
  field). The display layer (`makeFormatter`) converts; the filter does not.

**Approach:**

1. **Field typing.** Introduce a small per-field descriptor (in `model.ts`)
   classifying each `FieldId` as one of: `text`, `date`, `duration`, `distance`,
   `smallDistance`, `speed`, `vario`, `altitude`, `count`, `enum`. This drives
   input rendering, units, and the value↔base-unit conversion.
   - `duration`: airtime, timeInThermal, timeInRidge → **HH:MM input**.
   - `distance`: trackLength, straightDistance, freeDistance → unit suffix
     (km/mi).
   - `speed`: avgSpeed, windSpeed → km/h or mph. `vario`: maxClimb, maxSink.
     `altitude`: maxAlt, maxAltGain. `count`: thermalCount/glideCount/ridgeCount,
     **xcontestPoints** (task B). `enum`: site, glider. `text`: pilot, note.
2. **Unit-aware values.** The user types in **display units**; convert to base
   units when building the `FilterRule.value`, so `makeFilterFn` stays unchanged
   (it compares raw base-unit numbers). Add inverse converters to `units.ts`
   (e.g. `parseDistance(km, system) → meters`) or do the arithmetic in FilterBar
   using the same constants. Show the unit suffix from `fmt.labels.*`. **Pass
   `units` into `FilterBar`** (currently it only gets `filters`/`onChange`).
3. **HH:MM duration input.** A masked text input parsing `H:MM`/`HH:MM`
   → seconds, and formatting seconds → `HH:MM` for display. (Note `formatDuration`
   currently emits `H:MM:SS`; add a `parseHhMm`/`formatHhMm` helper.)
4. **Enum pickers for Site & Glider.** Replace the text box with a `<select>` (or
   multi-select chips). Options:
   - **Site:** from `settings.sites` (+ any distinct values present on flights).
   - **Glider:** derive distinct `flight.glider` values at render time (no stored
     list exists). Compute in `FlightsListScreen` and pass down, or compute in
     FilterBar from the flights prop (FilterBar currently has no flights prop —
     thread it in, or pass precomputed option lists).
   - Operator becomes `equals` (or a multi-value `in`). If multi-select is
     wanted, extend `FilterOp` with `in` and handle it in `makeFilterFn`. **Start
     with single-select `equals`; multi-select is a follow-up.**
5. **Visual redesign.** Rework `.filter-bar`/`.filter-rule` styles (both apps'
   `shell.css`). Suggested: each rule as a rounded "chip row" with a field pill,
   an operator pill, a typed value control, and a remove ✕; friendly operator
   labels (`is`, `contains`, `≥`, `≤`, `between`, `on or after`, `on or before`)
   via a label map; an "+ Add filter" affordance and "Clear all". Make it
   responsive for the narrow mobile header. Consider collapsing into a sheet on
   mobile (the list screen already toggles `showFilters`).

**Files:** `FilterBar.tsx` (both — keep them in sync), `model.ts` (both, field
descriptors + maybe `in` op), `FlightsTable.tsx` (both, if `in` op added),
`units.ts` (core, inverse converters + HH:MM helpers), `shell.css` (both).
Thread `units` and option lists from `FlightsListScreen` (both).

**Note:** this is the largest task; do it after B (so xcontestPoints is a
known field) and D, and consider the §0.1 extraction first to avoid double work.

---

## 7. Task F — Remove the dead "…" next to the 🪂 icon

**Root cause (confirmed):** there is no menu button. The "…" is the **CSS
text-overflow ellipsis** on `.app-title` (`shell.css` lines 58–65:
`white-space:nowrap; overflow:hidden; text-overflow:ellipsis`). When the header's
action buttons (Filter / Columns / + Import / ⚙️) squeeze the title on a narrow
screen, `"🪂 Paranalyzer"` truncates to `"🪂 …"`, which looks like a clickable
overflow menu but is just clipped text.

**Fix options:**
- Shrink/hide the title text on small widths and keep just the 🪂 logo (drop the
  ellipsis by allowing the title to shrink to the icon), **or**
- Give the title `flex-shrink: 0` and instead let the actions wrap / use icons so
  the title never clips, **or**
- Remove `text-overflow: ellipsis` and reserve space for the title.

**Recommendation:** on narrow widths show only `🪂` (no truncated word, no
ellipsis); show the full `🪂 Paranalyzer` when space allows. Pure CSS in both
apps' `shell.css`; no JSX change required (the title string lives in
`FlightsListScreen` headers).

**Files:** `apps/{web,mobile}/src/shell.css`.

---

## 8. Task G — Click a phase row → scroll the map into view

**Goal:** clicking a row in Thermals / Bad turns / Glides should scroll so the
**map is centered** in the viewport (in addition to the existing highlight/zoom).

**Current state** (`packages/ui`): `AnalysisView` owns `selected: Phase`.
Clicking a row calls `onSelect` (see `ThermalsTable`/`BadTurnsTable`/
`GlidesTable`); the `FlightMap` already reacts via `zoomTo={selected}`
(`AnalysisView.tsx:44`) and fits bounds to the phase. What's missing is
**scrolling the page** so the map is visible — the tables are *below* the map, so
after clicking you're looking at the table, not the map.

**Approach:**

1. In `AnalysisView`, add a `ref` to the map container (wrap `FlightMap` or add a
   `ref` to its `.map-wrap`).
2. In an effect keyed on `selected`, when a phase becomes selected call
   `mapRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })`.
3. Guard: only scroll on user-initiated selection (skip on initial mount /
   deselect). Block `"center"` satisfies "map in the middle of the screen".

**Subtlety:** the map must finish its `fitBounds` for the highlight to be
visible; scrolling and zooming are independent, both already triggered by
`selected`. The scroll container is the screen body (`.detail-body` /
`.list-body` use `overflow-y:auto`); `scrollIntoView` walks up to the nearest
scrollable ancestor, which works.

**Files:** `packages/ui/src/AnalysisView.tsx` (single change — covers both apps).
Possibly expose a `ref`/`id` on `FlightMap`'s root (`components/FlightMap.tsx`).

---

## 9. Task H — Wind-direction arrow in the list column

**Goal:** the "Wind dir" column in the flights table should render an **arrow**
(like the flight-detail wind field), not just `compassName + degrees`.

**Current state:** `FlightsTable.tsx` (both) renders
`` `${compassName(deg)} ${Math.round(deg)}°` `` (line 56) — text only. The detail
page uses `WindBadge` → `Arrow` (`packages/ui`), which already renders a rotated
SVG arrow.

**Approach:** in the `windFromDeg` column cell, render
`<Arrow deg={r.windFromDeg} size={14} />` followed by the text. The `Arrow`
component is exported from `@paranalyzer/ui` (`packages/ui/src/index.ts` — verify
it's exported; `WindBadge` is used, `Arrow` may need adding to the barrel). Since
the table cell currently returns a `string`, change the column `cell` to return
JSX — the `col()` helper signature is `(v) => string`; either broaden it to
`ReactNode` or special-case this column with `helper.accessor(..., { cell })`
returning JSX. Keep sorting by the numeric `windFromDeg`. `Arrow` is already
exported from `@paranalyzer/ui` (`packages/ui/src/index.ts:11`).

**Files:** `FlightsTable.tsx` (both).

---

## 10. Task I — Drag-and-drop to reorder fields

**Goal:** reorder columns by drag-and-drop instead of ▲/▼ buttons.

**Current state:** `ColumnConfigSheet.tsx` (both) lists columns with a visibility
checkbox and up/down `move(i, dir)` buttons writing the reordered array via
`onChange`. Order is persisted as `Settings.columns` (an ordered
`ColumnConfig[]`), consumed by `FlightsTable` as `columnOrder` (TanStack).

**Approach:**

1. Add drag-and-drop. Options:
   - **`@dnd-kit/core` + `@dnd-kit/sortable`** (recommended — touch-friendly for
     mobile, accessible, small). New dependency.
   - Native HTML5 DnD (`draggable`, `onDragOver`, `onDrop`) — no dep but poor
     touch support (bad for the mobile app).
   - **Decision: use `@dnd-kit/sortable`** since this must work on mobile touch.
2. Replace the `.col-reorder` ▲/▼ buttons with a drag handle (≡). Keep the
   visibility checkbox. On drag end, reorder the `columns` array and call
   `onChange` (same persistence path as today).
3. Keep ▲/▼ as a fallback? Optional — DnD plus accessible keyboard support from
   dnd-kit is sufficient. **Default: replace the arrows with a drag handle.**

**Files:** `ColumnConfigSheet.tsx` (both), `package.json` (both, add dnd-kit),
`shell.css` (both, drag handle + dragging styles).

**Note:** keep the two app copies identical; prime candidate for the §0.1
extraction.

---

## 11. Task J — "Remove all data" in Settings

**Goal:** a Settings action that wipes all flights + tracks + settings.

**Current state:** no bulk delete. `db.ts` has per-flight `deleteFlight` and the
whole DB lives under one `localStorage` key (`paranalyzer-db`); tracks live in
`trackStore` (web: in-memory `Map`; mobile: `Directory.Data/tracks/*`).

**Approach:**

1. Add `clearAllData()` to `data/db.ts` (both):
   - delete every track (`for (f of flights) deleteTrack(f.trackRef)`),
   - reset the doc to flights `[]` and settings to defaults, **but preserve the
     Google Drive connection** (decided). Concretely:
     `settings: { ...DEFAULT_SETTINGS, drive: prev.settings.drive }` — keep
     `drive.connected` (and the web/native auth token state) so the user stays
     signed in; everything else (columns, filters, sort, units, dateFormat,
     sites, `lastBackupAt`) returns to defaults. Clear `lastBackupAt` since the
     local data is gone.
   - reset the in-memory `cache` and persist.
   - On mobile also remove any leftover `tracks/` files.
2. **Settings UI:** a destructive button in a "Danger zone" section with a
   **double confirm** (e.g. `confirm("Delete ALL flights and data? This cannot be
   undone.")`). Append it to `SettingsScreen` (both apps already have a full
   Settings screen with multiple sections).
3. After wipe, navigate to the (now empty) list.

**Files:** `data/db.ts` (both), `screens/SettingsScreen.tsx` (both),
`data/trackStore.ts` (mobile — maybe a `clearAllTracks()` helper).

**Interaction with Drive (decided):** the Drive **connection is preserved** (user
stays signed in) and the Drive **backup file is not touched** — only local data
is wiped. Make this explicit in the confirm copy (e.g. "Your Google Drive backup
is kept"). A "also delete Drive backup" option is out of scope.

---

## 12. Mobile-only bugs

### 12.1 Task K — Export backup fails with `FILE_NOTCREATED`

**Root cause:** `exportBackup()` (`apps/mobile/src/data/backup.ts:44`) calls

```ts
Filesystem.writeFile({ path: fileName, data: json,
  directory: Directory.Documents, encoding: Encoding.UTF8 });
```

with **no `recursive: true`**. Compare `trackStore.saveTrack` (line 10) which
writes to `Directory.Data` **with `recursive: true`** and works. Capacitor
Filesystem throws `FILE_NOTCREATED` when it can't create the file because the
target directory path isn't materialized (the `Documents` dir may not exist in
the app sandbox until created).

**Fix:**
- Add `recursive: true` to the `writeFile` call, **and/or**
- Write to a directory known to exist (`Directory.Data` or `Directory.Cache`),
  **and/or** — better UX — hand the file to the OS share sheet so the user
  chooses where it lands.

**Recommendation:**
1. Minimal: add `recursive: true` (mirrors the working `trackStore` call).
2. Better: after writing, present a **Share** dialog (`@capacitor/share` +
   `Filesystem.getUri`) so the backup leaves the sandbox and the user can save it
   to Drive/Files. The current code writes to `Directory.Documents` and the toast
   says "Backup saved to Documents", but app-scoped Documents is not the visible
   `Documents/` folder on modern Android, so the file is effectively
   unreachable — Share fixes both discoverability and the error.

**Verification:** on a device/emulator, Export should toast success and the file
should exist (and, with Share, be exportable). Add error surfacing — the current
`run()` wrapper already toasts the error message, which is how `FILE_NOTCREATED`
became visible.

**Files:** `apps/mobile/src/data/backup.ts`; optionally `SettingsScreen.tsx`
(Share UI) + add `@capacitor/share`.

### 12.2 Task L — Connect Google Drive: "something went wrong"

**Symptom:** `connectDrive()` (`apps/mobile/src/data/drive.ts:52`) calls
`GoogleAuth.initialize()` + `GoogleAuth.signIn()`; sign-in fails with the
`@codetrix-studio/capacitor-google-auth` generic **"something went wrong"**.

**Most likely causes (Android), in order:**

1. **OAuth client / SHA-1 mismatch.** The Android OAuth client
   (`androidClientId` in `capacitor.config.ts`,
   `…-8p3th1ignl975cl0132obqcfko3lgfrs…`) must be registered with the **exact
   package name** (`net.approximator.paranalyzer`) **and the signing
   certificate's SHA-1** (debug keystore SHA-1 for dev builds; release SHA-1 for
   release). A mismatch is the #1 cause of this generic error (DEVELOPER_ERROR /
   code 10). Recent git history ("Separate Android and web OAuth clients",
   "Configure mobile Drive OAuth") suggests this is freshly set up and a likely
   culprit.
2. **Missing `serverClientId`.** The codetrix plugin needs a **Web** client ID as
   `serverClientId` to issue an ID token / refresh token for the requested
   scopes; the config only sets `androidClientId`. `getToken()` later calls
   `GoogleAuth.refresh()` expecting an `accessToken` — if no server/web client is
   configured for offline access, refresh/scope grant fails. **Add
   `serverClientId` (the Web client ID) to the `GoogleAuth` plugin config**, and
   ensure `forceCodeForRefreshToken`/scopes are consistent.
3. **Consent screen / scope not enabled.** The `drive.appdata` scope and the
   Drive API must be enabled on the consent screen for the project; unverified
   sensitive scopes can block non-test users. Confirm test users are added (if
   the app is in "testing").
4. **Plugin Android wiring.** The `patch-google-auth-plugin.mjs` postinstall and
   the recent Gradle-repo patches hint the plugin needed manual fixes; confirm
   the plugin is actually registered in the Android project and the Google
   Services config (`google-services.json`, if required by the setup) is present
   and matches the package.

**Plan:**
1. Reproduce with `adb logcat` while tapping Connect — the underlying status code
   (10 = DEVELOPER_ERROR → SHA-1/clientId; 12500/12501 → consent/cancel) tells us
   exactly which cause.
2. Add **`serverClientId`** (Web client ID) to the `GoogleAuth` config and verify
   SHA-1 registration for the debug + release keystores.
3. Improve error reporting: `connectDrive`'s failure currently bubbles to the
   `run()` toast as the plugin's opaque message — wrap and log the raw error
   (code + message) so future failures are diagnosable.
4. Once sign-in succeeds, validate `getToken()` (`GoogleAuth.refresh()`) returns
   a usable `accessToken` with the `drive.appdata` scope, then the existing
   `backupToDrive`/`restoreFromDrive` flow should work (the Drive REST calls
   themselves look correct).

**Files:** `apps/mobile/capacitor.config.ts` (add `serverClientId`),
`apps/mobile/src/data/drive.ts` (error logging), Android OAuth client
registration (Google Cloud console — out of repo), `README.md` (document the
`serverClientId` requirement; it currently only mentions `androidClientId`).

**Note:** this task has a **config/console** component that can't be fully fixed
in code — capture the SHA-1 + client-ID checklist in the README.

---

## 13. Suggested sequencing

0. **Task 0 — extract `packages/app`** (§1.1). Foundational; everything else is
   then a single edit. The mobile Drive fix (**L**) naturally lands while moving
   `drive.ts` into the adapter, so pair them.
1. **F** (CSS) + **H** (arrow) + **G** (map scroll) — quick wins, low risk.
2. **K** (mobile export `recursive:true` / Share) — one-line fix; **L** (Drive,
   needs Google console access) — start the logcat diagnosis in parallel.
3. **C** (auto-add site on import) + **J** (remove all data) — small, isolated.
4. **B** (xcontest points) + **D** (date format) — additive schema/settings.
5. **A** (duplicate import, exact `startTime`) — import flow + a new dialog.
6. **I** (drag-and-drop) + **E** (filter redesign) — largest UI work, last.

## 14. Decisions (resolved)

- **Code duplication:** extract shared app code into `packages/app` **first**
  (Task 0); implement A–J once there. ✅
- **A:** duplicate check uses **exact `startTime`** equality. ✅
- **B:** xcontest points is a **manual-entry** field (no scraping). ✅
- **C:** site edit/manage parity already exists in both apps; only auto-add on
  import is needed. ✅
- **E:** enum (Site/Glider) filters are **single-select**. ✅
- **I:** add whatever's needed for drag-and-drop — use **`@dnd-kit/core` +
  `@dnd-kit/sortable`** (touch-friendly, accessible). ✅
- **J:** "remove all data" wipes flights + tracks and **resets Settings to
  defaults, but keeps the Google Drive connection** (and leaves the Drive backup
  file untouched). ✅
