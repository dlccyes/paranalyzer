import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { AnyPhase, Flight } from "@paranalyzer/core";
import { PHASE_COLORS, varioColor, formatClock, type UnitFormatter } from "@paranalyzer/core";

interface Props {
  flight: Flight;
  fmt: UnitFormatter;
  active: AnyPhase | null;
  selected?: AnyPhase | null;
  hoverIdx: number | null;
  onHoverIdx: (i: number | null) => void;
  onSelect: (p: AnyPhase | null) => void;
  groundAlt?: number[];
}

interface Layout {
  W: number;
  H: number;
  PAD: { l: number; r: number; t: number; b: number };
  PLOT_W: number;
  PLOT_H: number;
}

const LAYOUT_WIDE: Layout = { W: 1000, H: 240, PAD: { l: 46, r: 14, t: 12, b: 26 }, PLOT_W: 940, PLOT_H: 202 };
const LAYOUT_TALL: Layout = { W: 560,  H: 360, PAD: { l: 46, r: 14, t: 12, b: 26 }, PLOT_W: 500, PLOT_H: 322 };
const MIN_WINDOW_S = 30;

/** Keep a [tStart, tEnd] window inside [t0, t1] and no narrower than MIN_WINDOW_S. */
function clampWindow(tS: number, tE: number, t0: number, t1: number): { tStart: number; tEnd: number } {
  let w = tE - tS;
  if (w < MIN_WINDOW_S) { w = MIN_WINDOW_S; tE = tS + w; }
  if (w >= t1 - t0) return { tStart: t0, tEnd: t1 };
  if (tS < t0) { tS = t0; tE = t0 + w; }
  if (tE > t1) { tE = t1; tS = t1 - w; }
  return { tStart: tS, tEnd: tE };
}

export function Barogram({ flight, fmt, active, selected, hoverIdx, onHoverIdx, onSelect, groundAlt }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth : 800,
  );
  const [view, setView] = useState<{ tStart: number; tEnd: number } | null>(null);

  // Refs for stable access inside native event handlers
  const viewRef = useRef(view);
  const layoutRef = useRef<Layout>(LAYOUT_WIDE);
  const modelRef = useRef<ReturnType<typeof buildModel> | null>(null);
  const onHoverIdxRef = useRef(onHoverIdx);

  const [s, e] = flight.range;
  const { fixes, derived, phases, ridgeSoars } = flight;
  const tz = flight.meta.tzOffsetMinutes ?? 0;

  useEffect(() => { viewRef.current = view; }, [view]);
  useEffect(() => { onHoverIdxRef.current = onHoverIdx; }, [onHoverIdx]);
  useEffect(() => { setView(null); }, [flight]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      setContainerWidth(entries[0]?.contentRect.width ?? 0);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const layout = containerWidth > 0 && containerWidth < 560 ? LAYOUT_TALL : LAYOUT_WIDE;
  useEffect(() => { layoutRef.current = layout; }, [layout]);

  const model = useMemo(() => {
    const m = buildModel(flight, fmt, view, layout, groundAlt);
    modelRef.current = m;
    return m;
  }, [flight, fmt, view, layout, groundAlt]);

  const idxFromClientX = useCallback((clientX: number): number | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const { W, PAD, PLOT_W } = layoutRef.current;
    const localX = ((clientX - rect.left) / rect.width) * W;
    const frac = (localX - PAD.l) / PLOT_W;
    if (frac < 0 || frac > 1) return null;
    const m = modelRef.current;
    if (!m) return null;
    const vw = viewRef.current ?? { tStart: m.t0, tEnd: m.t1 };
    const t = vw.tStart + frac * (vw.tEnd - vw.tStart);
    const dr = derived;
    let lo = s, hi = e;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (dr.t[mid] < t) lo = mid + 1;
      else hi = mid;
    }
    if (lo > s && Math.abs(dr.t[lo - 1] - t) < Math.abs(dr.t[lo] - t)) return lo - 1;
    return lo;
  }, [s, e, derived]);

  // Full-flight altitude sparkline for the scope/minimap (independent of zoom).
  const miniPath = useMemo(() => {
    const t0 = derived.t[s];
    const t1 = derived.t[e];
    let aMin = Infinity, aMax = -Infinity;
    for (let i = s; i <= e; i++) {
      const a = fixes[i].alt;
      if (a < aMin) aMin = a;
      if (a > aMax) aMax = a;
    }
    const span = aMax - aMin || 1;
    const mx = (t: number) => ((t - t0) / (t1 - t0)) * 100;
    const my = (a: number) => 20 - ((a - aMin) / span) * 20;
    let d = "M 0 20 ";
    for (let i = s; i <= e; i++) d += `L ${mx(derived.t[i]).toFixed(2)} ${my(fixes[i].alt).toFixed(2)} `;
    return d + "L 100 20 Z";
  }, [s, e, derived, fixes]);

  // Drag the scope window to pan the zoomed view.
  const scopeDragRef = useRef<{ startX: number; startView: { tStart: number; tEnd: number }; trackW: number } | null>(null);

  const onScopePointerDown = (ev: ReactPointerEvent<HTMLDivElement>) => {
    if (!view) return;
    const rect = ev.currentTarget.getBoundingClientRect();
    const { t0, t1 } = model;
    const winW = view.tEnd - view.tStart;
    const clickT = t0 + ((ev.clientX - rect.left) / rect.width) * (t1 - t0);
    // Clicking outside the window recenters it on the tap point first.
    let startView = view;
    if (clickT < view.tStart || clickT > view.tEnd) {
      startView = clampWindow(clickT - winW / 2, clickT + winW / 2, t0, t1);
      setView(startView);
    }
    scopeDragRef.current = { startX: ev.clientX, startView: { ...startView }, trackW: rect.width };
    ev.currentTarget.setPointerCapture(ev.pointerId);
  };

  const onScopePointerMove = (ev: ReactPointerEvent<HTMLDivElement>) => {
    const d = scopeDragRef.current;
    if (!d) return;
    const { t0, t1 } = model;
    const dt = ((ev.clientX - d.startX) / d.trackW) * (t1 - t0);
    setView(clampWindow(d.startView.tStart + dt, d.startView.tEnd + dt, t0, t1));
  };

  const endScopeDrag = (ev: ReactPointerEvent<HTMLDivElement>) => {
    scopeDragRef.current = null;
    if (ev.currentTarget.hasPointerCapture(ev.pointerId)) ev.currentTarget.releasePointerCapture(ev.pointerId);
  };

  // Native touch handlers (non-passive so preventDefault() works)
  const touchStateRef = useRef<{
    mode: "idle" | "scrub" | "pinch";
    pinchD0?: number;
    pinchViewAtStart?: { tStart: number; tEnd: number };
    pinchFocalT?: number;
  }>({ mode: "idle" });
  const lastTapRef = useRef<{ time: number; clientX: number; clientY: number } | null>(null);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    function pinchDist(t: TouchList) {
      const dx = t[0].clientX - t[1].clientX;
      const dy = t[0].clientY - t[1].clientY;
      return Math.hypot(dx, dy);
    }

    function clientXToFrac(clientX: number) {
      const rect = svg!.getBoundingClientRect();
      const { W, PAD, PLOT_W } = layoutRef.current;
      return (((clientX - rect.left) / rect.width) * W - PAD.l) / PLOT_W;
    }

    const onStart = (e: TouchEvent) => {
      const ts = touchStateRef.current;
      if (e.touches.length === 2) {
        e.preventDefault();
        ts.mode = "pinch";
        ts.pinchD0 = pinchDist(e.touches);
        const m = modelRef.current;
        const cur = viewRef.current ?? (m ? { tStart: m.t0, tEnd: m.t1 } : { tStart: 0, tEnd: 1 });
        ts.pinchViewAtStart = { ...cur };
        const midFrac = Math.max(0, Math.min(1, clientXToFrac(
          (e.touches[0].clientX + e.touches[1].clientX) / 2,
        )));
        ts.pinchFocalT = cur.tStart + midFrac * (cur.tEnd - cur.tStart);
      } else if (e.touches.length === 1) {
        ts.mode = "idle";
        const now = Date.now();
        const touch = e.touches[0];
        const last = lastTapRef.current;
        if (
          last && now - last.time < 300 &&
          Math.abs(touch.clientX - last.clientX) < 40 &&
          Math.abs(touch.clientY - last.clientY) < 40
        ) {
          e.preventDefault();
          setView(null);
          lastTapRef.current = null;
        } else {
          lastTapRef.current = { time: now, clientX: touch.clientX, clientY: touch.clientY };
        }
      }
    };

    const onMove = (e: TouchEvent) => {
      const ts = touchStateRef.current;
      if (e.touches.length === 2 && ts.mode === "pinch") {
        e.preventDefault();
        const { pinchD0, pinchViewAtStart, pinchFocalT } = ts;
        if (pinchD0 == null || !pinchViewAtStart || pinchFocalT == null) return;
        const d = pinchDist(e.touches);
        const scale = d / pinchD0;
        const oldWidth = pinchViewAtStart.tEnd - pinchViewAtStart.tStart;
        const newWidth = oldWidth / scale;
        const midFrac = Math.max(0, Math.min(1, clientXToFrac(
          (e.touches[0].clientX + e.touches[1].clientX) / 2,
        )));
        const newTStart = pinchFocalT - midFrac * newWidth;
        const m = modelRef.current;
        const t0 = m?.t0 ?? pinchViewAtStart.tStart;
        const t1 = m?.t1 ?? pinchViewAtStart.tEnd;
        setView(clampWindow(newTStart, newTStart + newWidth, t0, t1));
      } else if (e.touches.length === 1) {
        ts.mode = "scrub";
        e.preventDefault();
        onHoverIdxRef.current(idxFromClientX(e.touches[0].clientX));
      }
    };

    const onEnd = (e: TouchEvent) => {
      const ts = touchStateRef.current;
      if (e.touches.length === 0) {
        if (ts.mode === "scrub") onHoverIdxRef.current(null);
        ts.mode = "idle";
      } else if (e.touches.length < 2 && ts.mode === "pinch") {
        ts.mode = "idle";
      }
    };

    svg.addEventListener("touchstart", onStart, { passive: false });
    svg.addEventListener("touchmove", onMove, { passive: false });
    svg.addEventListener("touchend", onEnd, { passive: false });
    return () => {
      svg.removeEventListener("touchstart", onStart);
      svg.removeEventListener("touchmove", onMove);
      svg.removeEventListener("touchend", onEnd);
    };
  }, [idxFromClientX]);

  const { W, H, PAD, PLOT_H } = layout;
  const isZoomed = view !== null;
  const hover = hoverIdx != null ? { fix: fixes[hoverIdx], idx: hoverIdx } : null;
  const hoverX = hover ? model.xs(derived.t[hover.idx]) : 0;
  const hoverY = hover ? model.ys(hover.fix.alt) : 0;

  return (
    <div className="card barogram">
      <div className="panel-title">
        <span>Barogram</span>
        <span className="baro-legend">
          {groundAlt && (
            <span className="baro-legend-item">
              <i className="baro-legend-swatch baro-legend-swatch--terrain" />
              Ground
            </span>
          )}
        </span>
        <span className="baro-actions">
          {selected && (
            <button className="btn btn-xs btn-ghost" onClick={() => onSelect(null)}>
              ✕ Deselect
            </button>
          )}
          {isZoomed && (
            <button className="btn btn-xs btn-ghost" onClick={() => setView(null)}>
              ⟲ Reset zoom
            </button>
          )}
        </span>
      </div>
      <div className="barogram-plot" ref={containerRef}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="barogram-svg"
          onMouseMove={(ev) => onHoverIdx(idxFromClientX(ev.clientX))}
          onMouseLeave={() => onHoverIdx(null)}
          onClick={(ev) => {
            const i = idxFromClientX(ev.clientX);
            if (i == null) return;
            const phase = phases.find((ph) => i >= ph.startIdx && i <= ph.endIdx);
            if (phase) { onSelect(phase === active ? null : phase); return; }
            const ridge = ridgeSoars.find((r) => i >= r.startIdx && i <= r.endIdx);
            const hit = ridge ?? null;
            onSelect(hit === active ? null : hit);
          }}
        >
          {phases.map((p, i) => (
            <rect
              key={i}
              x={model.xs(derived.t[p.startIdx])}
              y={H - PAD.b}
              width={Math.max(1, model.xs(derived.t[p.endIdx]) - model.xs(derived.t[p.startIdx]))}
              height={6}
              fill={PHASE_COLORS[p.kind]}
              opacity={active === p ? 1 : 0.6}
            />
          ))}

          {ridgeSoars.map((r, i) => (
            <rect
              key={i}
              x={model.xs(derived.t[r.startIdx])}
              y={H - PAD.b}
              width={Math.max(1, model.xs(derived.t[r.endIdx]) - model.xs(derived.t[r.startIdx]))}
              height={6}
              fill={PHASE_COLORS.ridge}
              opacity={active === r ? 1 : 0.6}
            />
          ))}

          {active && (
            <rect
              x={model.xs(derived.t[active.startIdx])}
              y={PAD.t}
              width={Math.max(1, model.xs(derived.t[active.endIdx]) - model.xs(derived.t[active.startIdx]))}
              height={PLOT_H}
              fill={PHASE_COLORS[active.kind]}
              opacity={0.12}
            />
          )}

          {model.yticks.map((t, i) => (
            <g key={i}>
              <line x1={PAD.l} x2={W - PAD.r} y1={t.y} y2={t.y} className="grid-line" />
              <text x={PAD.l - 6} y={t.y + 3} className="axis-label y">{t.label}</text>
            </g>
          ))}

          {model.xticks.map((t, i) => (
            <text key={i} x={t.x} y={H - 8} className="axis-label x">{t.label}</text>
          ))}

          {model.terrainPath && <path d={model.terrainPath} className="baro-terrain" />}
          <path d={model.areaPath} className="baro-area" />
          {model.runs.map((r, i) => (
            <polyline key={i} points={r.pts} fill="none" stroke={r.color} strokeWidth={2} strokeLinejoin="round" />
          ))}

          {hover && (
            <g>
              <line x1={hoverX} x2={hoverX} y1={PAD.t} y2={H - PAD.b} className="hover-line" />
              <circle cx={hoverX} cy={hoverY} r={4} className="hover-dot" />
            </g>
          )}
        </svg>

        {hover && (
          <div
            className="baro-tooltip"
            style={{
              left: `${(hoverX / W) * 100}%`,
              transform: hoverX > W * 0.7 ? "translateX(-105%)" : "translateX(8px)",
            }}
          >
            <div><b>{fmt.altitude(hover.fix.alt)}</b></div>
            {groundAlt && <div className="muted">AGL {fmt.altitude(hover.fix.alt - groundAlt[hover.idx])}</div>}
            <div>{fmt.vario(derived.vario[hover.idx])}</div>
            <div>{fmt.speed(derived.groundSpeed[hover.idx])}</div>
            <div className="muted">{formatClock(hover.fix.time, tz)}</div>
          </div>
        )}
      </div>

      {isZoomed && (
        <div
          className="baro-scope"
          onPointerDown={onScopePointerDown}
          onPointerMove={onScopePointerMove}
          onPointerUp={endScopeDrag}
          onPointerCancel={endScopeDrag}
        >
          <svg className="baro-scope-mini" viewBox="0 0 100 20" preserveAspectRatio="none">
            <path d={miniPath} className="baro-scope-area" />
          </svg>
          <div
            className="baro-scope-window"
            style={{
              left: `${((view!.tStart - model.t0) / (model.t1 - model.t0)) * 100}%`,
              width: `${((view!.tEnd - view!.tStart) / (model.t1 - model.t0)) * 100}%`,
            }}
          />
        </div>
      )}
    </div>
  );
}

function buildModel(flight: Flight, fmt: UnitFormatter, view: { tStart: number; tEnd: number } | null, layout: Layout, groundAlt?: number[]) {
  const [s, e] = flight.range;
  const { fixes, derived } = flight;
  const tz = flight.meta.tzOffsetMinutes ?? 0;
  const { PAD, PLOT_W, PLOT_H } = layout;

  const t0 = derived.t[s];
  const t1 = derived.t[e];
  const tStart = view?.tStart ?? t0;
  const tEnd = view?.tEnd ?? t1;

  // y-axis re-fits to the visible window
  let aMin = Infinity, aMax = -Infinity;
  for (let i = s; i <= e; i++) {
    const t = derived.t[i];
    if (t >= tStart && t <= tEnd) {
      if (fixes[i].alt < aMin) aMin = fixes[i].alt;
      if (fixes[i].alt > aMax) aMax = fixes[i].alt;
      if (groundAlt && groundAlt[i] < aMin) aMin = groundAlt[i];
    }
  }
  if (!isFinite(aMin)) { aMin = 0; aMax = 1000; }
  const altPad = (aMax - aMin) * 0.08 || 10;
  aMin -= altPad;
  aMax += altPad;

  const xs = (t: number) => PAD.l + ((t - tStart) / (tEnd - tStart)) * PLOT_W;
  const ys = (a: number) => PAD.t + (1 - (a - aMin) / (aMax - aMin)) * PLOT_H;

  const runs: { color: string; pts: string }[] = [];
  let cur: { color: string; pts: string } | null = null;
  let curColor = "";
  for (let i = s; i <= e; i++) {
    const color = varioColor(derived.vario[i]);
    const xy = `${xs(derived.t[i]).toFixed(1)},${ys(fixes[i].alt).toFixed(1)}`;
    if (color !== curColor) {
      if (cur) cur.pts += " " + xy;
      cur = { color, pts: xy };
      runs.push(cur);
      curColor = color;
    } else {
      cur!.pts += " " + xy;
    }
  }

  const areaPath =
    `M ${xs(derived.t[s]).toFixed(1)} ${ys(aMin).toFixed(1)} ` +
    Array.from({ length: e - s + 1 }, (_, k) => {
      const i = s + k;
      return `L ${xs(derived.t[i]).toFixed(1)} ${ys(fixes[i].alt).toFixed(1)}`;
    }).join(" ") +
    ` L ${xs(derived.t[e]).toFixed(1)} ${ys(aMin).toFixed(1)} Z`;

  const yticks: { y: number; label: string }[] = [];
  for (let k = 0; k <= 4; k++) {
    const a = aMin + ((aMax - aMin) * k) / 4;
    yticks.push({ y: ys(a), label: fmt.altitude(a) });
  }

  const xticks: { x: number; label: string }[] = [];
  const totalMin = (tEnd - tStart) / 60;
  const stepMin = totalMin > 60 ? 15 : totalMin > 20 ? 10 : totalMin > 5 ? 5 : 1;
  const firstM = Math.ceil((tStart - t0) / 60 / stepMin) * stepMin;
  for (let m = firstM; t0 + m * 60 <= tEnd; m += stepMin) {
    const t = t0 + m * 60;
    xticks.push({ x: xs(t), label: formatClock(fixes[s].time + m * 60_000, tz) });
  }

  const terrainPath = groundAlt
    ? `M ${xs(derived.t[s]).toFixed(1)} ${ys(aMin).toFixed(1)} ` +
      Array.from({ length: e - s + 1 }, (_, k) => {
        const i = s + k;
        return `L ${xs(derived.t[i]).toFixed(1)} ${ys(groundAlt![i]).toFixed(1)}`;
      }).join(" ") +
      ` L ${xs(derived.t[e]).toFixed(1)} ${ys(aMin).toFixed(1)} Z`
    : null;

  return { t0, t1, tStart, tEnd, aMin, aMax, xs, ys, runs, areaPath, terrainPath, yticks, xticks };
}
