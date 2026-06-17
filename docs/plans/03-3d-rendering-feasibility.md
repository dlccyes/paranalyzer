# 03 — 3D track rendering (feasibility)

## Question

Can we render a flight in **3D** — the track floating at its true GPS altitude
over real terrain, ideally with a time-animated replay (à la Doarama / ayvri)?

## We already have the data

`flight.fixes[]` carries `lat`, `lon`, `alt`, `time` for every point. That is
exactly a `(lon, lat, height)` + timestamp series — directly feedable to any of
the engines below as a polyline or an animated position property. **No new data
work is required**; this is purely a rendering/dependency question.

## Options

### A. CesiumJS (+ Resium for React) — recommended to spike

- True 3D globe, **real terrain** (Cesium World Terrain), imagery, and a
  time-dynamic `SampledPositionProperty` that gives us replay/scrubbing nearly
  for free.
- Best UX for paragliding: altitude vs. terrain is the whole point.
- **Costs/risks:**
  - Bundle is large (Cesium engine is multi-MB). Mandatory to **code-split /
    lazy-load** the 3D view so it never touches the main bundle or the 2D map
    path.
  - Terrain + default imagery want a **Cesium ion token** (free tier exists).
    Can run with ellipsoid/no-terrain tokenless, but then we lose the main
    benefit. A token is a config/secret concern (`VITE_*`), per-platform.
  - WebGL required. Fine on modern Android WebView; verify on a mid/low device.
  - Vite integration needs `vite-plugin-cesium` (or manual static-asset copy).

### B. deck.gl + MapLibre GL

- `PathLayer`/`TripsLayer` with a pitched MapLibre basemap. Lighter than Cesium,
  WebGL2, nice animated `TripsLayer` trails.
- Terrain is optional (MapLibre `setTerrain` with a DEM source) but the track is
  drawn in a 3D scene so we can float it at real altitude.
- More glue code than Cesium for replay; terrain is a bolt-on, not built-in.

### C. MapLibre GL JS alone

- Supports `pitch`/`bearing` and 3D terrain, but lines are **draped on terrain**,
  not floated at arbitrary height — so it can't honestly show "200 m above the
  ridge." Good for a cheap "tilted map" but not a real altitude view. Not
  recommended for the actual goal.

### D. Three.js (custom)

- Total control, smallest dependency, but we'd build camera, terrain, tiles,
  and replay ourselves. Highest effort; only worth it if A/B's bundle size is
  unacceptable.

## Recommendation

**Feasible — recommend a time-boxed spike on Cesium/Resium (option A)** behind a
lazy-loaded route (e.g. `/flight/:id/3d`), with deck.gl (B) as the fallback if
Cesium's bundle or low-end performance disappoints.

## Spike plan (throwaway branch, ~1 day)

1. Lazy-load a `Flight3DScreen` (React.lazy + dynamic import) so nothing lands in
   the main chunk.
2. Feed one real flight's `fixes` into a Cesium polyline at true height + a
   `SampledPositionProperty` for an animated marker.
3. **Measure the decision gates:**
   - Added bundle size of the lazy chunk (gzipped).
   - FPS / interaction smoothness on a mid Android device in the Capacitor
     WebView (not just desktop Chrome).
   - Integration effort for token/terrain config across web + mobile.
4. Decide A vs. B vs. defer. Capture numbers back in this doc.

## Open questions for the decision

- Acceptable bundle budget for an opt-in 3D view? (Lazy chunk, but still a cost.)
- Token management: is a Cesium ion free token acceptable, or must it be
  fully tokenless/self-hosted terrain?
- Do we want full replay (camera follows the pilot) or just a static 3D track in
  v1? Replay is cheaper with Cesium than with deck.gl.

## Not in scope of the exploration

Shipping it. This doc produces a **go/no-go with measured numbers**, not a
feature.
