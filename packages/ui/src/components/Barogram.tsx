import { useMemo, useRef } from "react";
import type { Flight, Phase } from "@paranalyzer/core";
import { PHASE_COLORS, varioColor, formatClock, type UnitFormatter } from "@paranalyzer/core";

interface Props {
  flight: Flight;
  fmt: UnitFormatter;
  active: Phase | null;
  hoverIdx: number | null;
  onHoverIdx: (i: number | null) => void;
  onSelect: (p: Phase | null) => void;
}

const W = 1000;
const H = 240;
const PAD = { l: 46, r: 14, t: 12, b: 26 };
const PLOT_W = W - PAD.l - PAD.r;
const PLOT_H = H - PAD.t - PAD.b;

export function Barogram({ flight, fmt, active, hoverIdx, onHoverIdx, onSelect }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [s, e] = flight.range;
  const { fixes, derived, phases } = flight;
  const tz = flight.meta.tzOffsetMinutes ?? 0;

  const model = useMemo(() => {
    const t0 = derived.t[s];
    const t1 = derived.t[e];
    let aMin = Infinity;
    let aMax = -Infinity;
    for (let i = s; i <= e; i++) {
      if (fixes[i].alt < aMin) aMin = fixes[i].alt;
      if (fixes[i].alt > aMax) aMax = fixes[i].alt;
    }
    const pad = (aMax - aMin) * 0.08 || 10;
    aMin -= pad;
    aMax += pad;

    const xs = (t: number) => PAD.l + ((t - t0) / (t1 - t0)) * PLOT_W;
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
      `M ${xs(t0).toFixed(1)} ${ys(aMin).toFixed(1)} ` +
      Array.from({ length: e - s + 1 }, (_, k) => {
        const i = s + k;
        return `L ${xs(derived.t[i]).toFixed(1)} ${ys(fixes[i].alt).toFixed(1)}`;
      }).join(" ") +
      ` L ${xs(t1).toFixed(1)} ${ys(aMin).toFixed(1)} Z`;

    const yticks: { y: number; label: string }[] = [];
    for (let k = 0; k <= 4; k++) {
      const a = aMin + ((aMax - aMin) * k) / 4;
      yticks.push({ y: ys(a), label: fmt.altitude(a) });
    }

    const xticks: { x: number; label: string }[] = [];
    const totalMin = (t1 - t0) / 60;
    const stepMin = totalMin > 60 ? 15 : totalMin > 20 ? 10 : 5;
    for (let m = 0; m * 60 <= t1 - t0; m += stepMin) {
      const t = t0 + m * 60;
      xticks.push({ x: xs(t), label: formatClock(fixes[s].time + m * 60_000, tz) });
    }

    return { t0, t1, aMin, aMax, xs, ys, runs, areaPath, yticks, xticks };
  }, [flight, fmt, s, e, derived, fixes, tz]);

  const idxFromClientX = (clientX: number): number | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const localX = ((clientX - rect.left) / rect.width) * W;
    const frac = (localX - PAD.l) / PLOT_W;
    if (frac < 0 || frac > 1) return null;
    const t = model.t0 + frac * (model.t1 - model.t0);
    let lo = s;
    let hi = e;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (derived.t[mid] < t) lo = mid + 1;
      else hi = mid;
    }
    if (lo > s && Math.abs(derived.t[lo - 1] - t) < Math.abs(derived.t[lo] - t)) return lo - 1;
    return lo;
  };

  const hover = hoverIdx != null ? { fix: fixes[hoverIdx], idx: hoverIdx } : null;
  const hoverX = hover ? model.xs(derived.t[hover.idx]) : 0;
  const hoverY = hover ? model.ys(hover.fix.alt) : 0;

  return (
    <div className="card barogram">
      <div className="panel-title">Barogram</div>
      <div className="barogram-plot">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="barogram-svg"
          onMouseMove={(ev) => onHoverIdx(idxFromClientX(ev.clientX))}
          onMouseLeave={() => onHoverIdx(null)}
          onClick={(ev) => {
            const i = idxFromClientX(ev.clientX);
            if (i == null) return;
            const p = phases.find((ph) => i >= ph.startIdx && i <= ph.endIdx);
            onSelect(p ?? null);
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
            <div>{fmt.vario(derived.vario[hover.idx])}</div>
            <div>{fmt.speed(derived.groundSpeed[hover.idx])}</div>
            <div className="muted">{formatClock(hover.fix.time, tz)}</div>
          </div>
        )}
      </div>
    </div>
  );
}
