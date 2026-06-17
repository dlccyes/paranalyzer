# 06 — Ground level in the barogram (implementation)

## Goal

Draw a **terrain profile** under the altitude trace in the barogram, like
XContest: a shaded "ground" area following the elevation of the land beneath the
flight path, so height-above-ground (AGL) is visible at a glance and on hover.

Today [`Barogram.tsx`](../../packages/ui/src/components/Barogram.tsx) plots the
GPS-altitude trace (`fixes[i].alt`) and fills a flat area down to the chart's
`aMin`. There is no notion of ground.

## Current state

- `flight.fixes[]` has `lat`, `lon`, `alt` (GPS/geometric, metres), `time`, and
  optional `pressureAlt`. **No terrain elevation anywhere** in the data model
  (`grep` for `elevation`/`terrain` is empty).
- The app is **local-first / "entirely in your browser"** (see `index.html`
  description). There are **no network calls today** except Google Drive backup.
  Tracks + derived `FlightRecord`s live in IndexedDB (web) / filesystem
  (Capacitor Android) behind the `PlatformAdapter`
  ([`platform.ts`](../../packages/app/src/platform.ts)).
- Map already uses Leaflet OSM tiles in
  [`FlightMap.tsx`](../../packages/ui/src/components/FlightMap.tsx) — so tile
  fetching infra and the "we fetch map data online" precedent already exist.

## The crux: where does terrain elevation come from?

We need a Digital Elevation Model (DEM) lookup for each `lat`/`lon`. Three
families, with the trade-off being **network/offline/privacy vs. effort**:

| Option | How | Pros | Cons |
|--------|-----|------|------|
| **A. Elevation API (batch point query)** | POST/GET lat-lon list to a hosted DEM service | Trivial; tiny code; good resolution | Needs network; sends coordinates to a 3rd party; rate limits |
| **B. Terrain-RGB raster tiles** | Fetch DEM tiles (AWS Terrarium / Mapbox Terrain-RGB), decode elevation from pixel RGB, sample | Reuses tile/caching mental model from the map; can be cached offline per region | More code (PNG decode, tile math); still a fetch |
| **C. Bundled / on-demand DEM** | Ship or download SRTM `.hgt` tiles | Fully offline + private | A single SRTM1 1°×1° tile ≈ 25 MB — impractical to bundle globally |

### Candidate sources (Option A)

- **Open-Meteo Elevation API** — `GET https://api.open-meteo.com/v1/elevation?latitude=a,b,c&longitude=…`,
  returns `{ elevation: number[] }`. **Free, no API key, CORS-enabled**, Copernicus
  GLO-90 (~90 m). Accepts up to ~100 coordinates/request. **Recommended default.**
- OpenTopoData (`/v1/srtm90m`, batchable, rate-limited) or Open-Elevation —
  fallbacks / self-hostable.

### Recommendation

**Phase 1 = Option A (Open-Meteo), fetched once and cached on the flight.** It is
the smallest change that ships the feature, and caching makes it private-ish and
offline after first load. Keep **Option B as a Phase 2** upgrade for users who
want fully offline terrain (reuse Leaflet's tile cache, no per-coordinate API).

## Datum caveat (call out in UI/docs)

`fixes.alt` is **WGS84 ellipsoidal**; SRTM/Copernicus DEMs are **EGM96 geoid
(MSL)**. The geoid undulation can be ±tens of metres, so raw `alt − groundElev`
is not exact AGL. Two acceptable handlings:

1. **Document it** and accept small offset (simplest), or
2. **Anchor to takeoff:** compute one offset so the first fix sits ~0 m AGL
   (or use the DEM elevation at the launch point), then shift the trace/ground.

XContest sidesteps this by using pressure altitude vs. SRTM; we can stay on GPS
alt and apply the takeoff anchor if the raw offset looks wrong on the sample.

## Work breakdown

### 1. Elevation capability on `PlatformAdapter`

Add an explicit, mockable network capability (keeps the one external call out of
the UI and lets Android use `CapacitorHttp` to dodge CORS):

```ts
// platform.ts
fetchElevations?(points: { lat: number; lon: number }[]): Promise<number[]>;
```

- **Web adapter:** `fetch` Open-Meteo in chunks of ≤100, concatenate.
- **Android adapter:** same via `CapacitorHttp` (no CORS), or plain fetch.
- Absent / throwing ⇒ feature silently degrades (no terrain drawn).

### 2. Sample + cache a ground profile per flight

- **Downsample** the track to N≈256 evenly-spaced fixes (by index or cumulative
  distance) — full resolution is unnecessary and blows the API budget.
- Fetch elevations for those N points; **linearly interpolate back to every fix
  index** to get a per-fix `groundAlt[]` for the trace + hover.
- **Cache** the sampled profile so it's computed once and survives reloads/offline:
  store `groundProfile?: { sampleIdx: number[]; elev: number[] }` (compact) on the
  `FlightRecord` ([`record.ts`](../../packages/core/src/record.ts)) — or as a
  sidecar in the track store. Fetch lazily at **import** and on **flight open**
  if absent; expose a "Fetch terrain for all flights" action mirroring
  `recalcAll`. Include in backup so restores keep it (re-fetchable, so optional).
- This is **enrichment, not analysis** — do **not** bump `ANALYSIS_VERSION`; gate
  on `groundProfile == null` instead.

### 3. Render the terrain area in `Barogram.tsx`

- Expand the y-domain: today `aMin/aMax` come from flight alt only. Recompute
  `aMin = min(flightMin, groundMin)` so terrain isn't clipped when the valley
  floor dips below the lowest fix.
- Build a **ground area path**: polyline of `ys(groundAlt[i])` across x, closed
  down to `ys(aMin)`, filled with an earthy/neutral terrain color, drawn **behind**
  the existing `baro-area` + vario polylines.
- Add a terrain colour token in [`colors.ts`](../../packages/core/src/colors.ts)
  and a `.baro-terrain` CSS rule.
- **Hover tooltip:** add an **AGL** line = `fmt.altitude(fix.alt − groundAlt[idx])`.
- Render nothing extra when `groundProfile` is missing/loading (feature is additive).

### 4. Settings (optional, minimal)

- A "Show ground level" toggle (default **on**) in `SettingsScreen`, following the
  existing settings + `analyzeOptions`/recalc pattern.
- A short **privacy note**: enabling terrain sends downsampled track coordinates
  to the elevation provider. (Consider defaulting **off** until first enabled if
  we want to be strict about the local-first promise.)

## Verification

- **Sample flight** (`sample-woodrat.igc`): valley floor ≈ 500–600 m, launch
  (Woodrat) ≈ 950 m. Confirm the ground line sits below the trace, launch fix is
  ~0 m AGL after anchoring, and max AGL is plausible.
- **Unit test** the sampler/interpolator with a mock `fetchElevations` (deterministic
  fn of lat/lon) — no network in tests.
- **Preview**: visual check of the terrain fill + AGL tooltip; resize for mobile.

## Risks / open questions

- **Privacy vs. local-first:** sending coordinates to a 3rd-party API is the one
  real tension. Mitigations: cache so it's one-shot, make it a toggle, allow a
  self-hosted endpoint (OpenTopoData) later.
- **Offline mobile:** first fetch needs connectivity; cached thereafter. Phase 2
  (tiles) improves this.
- **Datum offset** (above) — decide raw vs. takeoff-anchored on the sample.
- **API limits/reliability** (Open-Meteo ~10k req/day free) — chunking + caching
  keeps us well under; degrade gracefully on failure.

## Phasing

- **Phase 1 (this doc):** Open-Meteo via `PlatformAdapter.fetchElevations`,
  downsample + interpolate + cache on `FlightRecord`, terrain area + AGL tooltip,
  optional toggle. Graceful offline.
- **Phase 2 (later):** Terrain-RGB tiles reusing the Leaflet tile cache for fully
  offline/private terrain; geoid correction.
