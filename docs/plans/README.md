# Plans — June 2026 batch

Open work items. Docs 03–04 are **feasibility explorations** (research +
recommendation + a scoped spike, not a commitment to ship); docs 05–06 are
concrete implementation plans.

| # | Item | Type | Doc |
|---|------|------|-----|
| 3 | 3D track rendering | Feasibility | [03-3d-rendering-feasibility.md](03-3d-rendering-feasibility.md) |
| 4 | In-app update detection | Feasibility | [04-in-app-update-detection.md](04-in-app-update-detection.md) |

## Shared context

- Map is **Leaflet + react-leaflet** (single OSM `TileLayer`) in
  [`packages/ui/src/components/FlightMap.tsx`](../../packages/ui/src/components/FlightMap.tsx).
- Flight data is `flight.fixes[]` with `lat`, `lon`, `alt`, `time` — already
  enough to drive a 3D replay or an altitude-extruded track.
- Mobile is **Capacitor 6 / Android**, sideloaded as a debug APK published to a
  rolling GitHub release tag `android-latest` by
  [`.github/workflows/android.yml`](../../.github/workflows/android.yml).
- Web ships to GitHub Pages (`paranalyzer.approximator.net`) via
  [`.github/workflows/gh-deploy.yml`](../../.github/workflows/gh-deploy.yml).
  No service worker today.
- Web/mobile differences are isolated behind the `PlatformAdapter`
  ([`packages/app/src/platform.ts`](../../packages/app/src/platform.ts)). New
  cross-cutting capabilities (e.g. "what version am I / is there a newer one")
  belong on that interface.
