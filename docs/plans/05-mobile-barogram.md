# 05 — Improve the barogram on mobile

## Problem

The barogram ([`Barogram.tsx`](../../packages/ui/src/components/Barogram.tsx)) is
a fixed `viewBox="0 0 1000 240"` SVG (≈ **4.2 : 1**, landscape) scaled to
`width: 100%`. On a portrait phone the width constraint forces a tiny height.

**Measured at 375 px viewport:** the SVG renders **325 × 78 px**, of which only
~**66 px** is actual plot area (`PAD.t=12`, `PAD.b=26`). The whole altitude
profile of a 1.5-hour flight is squeezed into 66 vertical pixels — thermals,
glides and the climb/descent shape are nearly unreadable.

Two distinct issues fall out of this:

1. **Sizing** — the landscape aspect ratio collapses vertically in portrait.
2. **Touch interaction** — the component only wires `onMouseMove` /
   `onMouseLeave` / `onClick`. Tap-to-select-a-phase works (touch fires a
   synthetic click), but **finger-scrubbing to read altitude/vario/time at a
   point does not work on touch at all** — there are no touch handlers.

## Goals

- Make the altitude profile legibly tall on a portrait phone (target plot
  height ≈ **180 px**, roughly 2.5–3× today).
- **Pinch-to-zoom the time axis** (with pan) so a long flight's detail is
  reachable — a taller chart alone can't fix horizontal time compression.
- Let a finger scrub the tooltip along the track, without breaking vertical page
  scroll.
- Leave the desktop layout unchanged.

## Approach

### Phase 1 (recommended, ships the fix)

**1a. Responsive aspect ratio.** The geometry constants `W`, `H`, `PAD`,
`PLOT_W`, `PLOT_H` are module-level today. Promote them to a per-render
`layout` chosen from the plot's measured width (a `ResizeObserver` on
`.barogram-plot`, or a `max-width: 560px` media query):

| variant | viewBox | ratio | plot height @375px |
|---------|---------|-------|--------------------|
| wide (desktop, today) | `1000 × 240` | 4.2:1 | — |
| tall (mobile) | `560 × 360` | 1.55:1 | **~206 px** |

`model` already derives everything (`xs`, `ys`, ticks, runs, area, phase strip)
from those constants, so the only change is making them variables and threading
them in. The x-axis tick density (`stepMin`) and y-tick count may want a small
tweak for the narrower tall layout.

**1b. Pinch-to-zoom + pan on the time axis.** This is the part that actually
makes a long flight readable; implement it by zooming the **data window**, not by
CSS-scaling a wide SVG (which would need a separate sticky y-axis and blur the
strokes).

- Add state `view: { tStart, tEnd }`, initialized to the full range `[t0, t1]`.
  Make `xs` map from the *visible* window: `xs(t) = PAD.l + ((t - tStart) /
  (tEnd - tStart)) * PLOT_W`. `model` already recomputes from the scale, so it
  just needs to depend on `view`. `idxFromClientX` must use the same window
  (today it reads `model.t0/t1` — point it at `view`).
- **Re-fit the y-axis to the visible window.** Recompute `aMin/aMax` over only
  the fixes inside `[tStart, tEnd]`. This is what reclaims the vertical space on
  mobile — zooming into a ridge stretches that altitude band to fill the plot.
- **Gesture model** (branch on `e.touches.length`):
  - **1 finger, horizontal drag → scrub** the tooltip (reuses
    `idxFromClientX(touch.clientX) → onHoverIdx`; clear on touch end).
  - **2 fingers → pinch + pan.** On `touchstart` record pinch distance `d0`, the
    window `[tStart, tEnd]`, and the focal time under the midpoint. On
    `touchmove`: new window width = `oldWidth × d0/d` clamped to
    `[minWindow, fullRange]`, anchored so the focal time stays under the
    midpoint; also translate by the midpoint's horizontal movement to pan.
    Clamp the window inside `[t0, t1]`.
  - **Double-tap → reset** to the full range.
- `minWindow` clamp: a few sample intervals (≈ 20–30 s) so you can't over-zoom
  past the data; clamp the upper bound so you can't pan/zoom outside the flight.
- A small **"reset zoom"** affordance (e.g. a ⤢/⟲ button shown only when zoomed)
  for discoverability alongside double-tap.

**1c. Touch scrubbing + gesture routing.** The critical CSS detail: set
**`touch-action: pan-y`** on `.barogram-svg`. That keeps *vertical* swipes as
page scroll while handing us *horizontal* drags (scrub) **and** multi-touch
(pinch) — with `pan-y`, the browser does not run its own pinch-zoom, so our
handler owns it. Call `preventDefault()` in `onTouchMove` once a horizontal
scrub or a pinch is in progress, so the page doesn't also move.

Desktop keeps mouse hover/scrub as today; optionally add wheel-to-zoom there too,
but that's a bonus, not required.

### Phase 2 (optional follow-up)

- **Fullscreen / landscape expand.** An expand button that opens the barogram in
  a fullscreen overlay sized to the viewport; rotating the phone to landscape
  then gives it the near-native 4:1 ratio at full size. Cheap, well-understood
  "tap chart to enlarge" pattern; complements 1a/1b but isn't required for them.

## Files touched (Phase 1)

- `packages/ui/src/components/Barogram.tsx` — parameterize geometry by variant;
  measure width; `view` window state + y-refit; touch handlers (scrub + pinch +
  double-tap reset); point `idxFromClientX` at `view`.
- `packages/ui/src/styles.css` — `.barogram-svg { touch-action: pan-y; }`,
  optional mobile `min-height` on `.barogram-plot`, reset-zoom button styling.

## Out of scope (Phase 1)

Fullscreen/landscape overlay (Phase 2), per-axis independent zoom, data
downsampling, changing the desktop layout.

## Acceptance

- At 375 px portrait, the barogram plot is ≥ ~180 px tall and the climb/glide
  shape is clearly readable.
- **Pinch zooms the time axis around the pinch point; two-finger drag pans; the
  y-axis re-fits to the visible window; double-tap (or the reset button) returns
  to the full flight.** Zoom/pan clamp to the flight bounds.
- A one-finger horizontal drag scrubs the tooltip; a vertical swipe still scrolls
  the page.
- Tap-to-select-phase still works.
- Desktop barogram visually unchanged.
- Verified in the web preview at 375 px (touch emulation) and desktop.
