import { useEffect, useMemo } from "react";
import {
  CircleMarker,
  MapContainer,
  Polyline,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import type { AnyPhase, Flight } from "@paranalyzer/core";
import { buildVarioSegments, PHASE_COLORS, VARIO_LEGEND } from "@paranalyzer/core";

interface Props {
  flight: Flight;
  highlight: AnyPhase | null;
  zoomTo: AnyPhase | null;
  hoverIdx: number | null;
}

export function FlightMap({ flight, highlight, zoomTo, hoverIdx }: Props) {
  const segments = useMemo(() => buildVarioSegments(flight), [flight]);
  const [s, e] = flight.range;
  const launch = flight.fixes[s];
  const land = flight.fixes[e];

  const bounds = useMemo(() => {
    const lats = flight.fixes.map((f) => f.lat);
    const lons = flight.fixes.map((f) => f.lon);
    return L.latLngBounds(
      [Math.min(...lats), Math.min(...lons)],
      [Math.max(...lats), Math.max(...lons)],
    );
  }, [flight]);

  const highlightPositions = useMemo<[number, number][] | null>(() => {
    if (!highlight) return null;
    const pts: [number, number][] = [];
    for (let i = highlight.startIdx; i <= highlight.endIdx; i++) {
      pts.push([flight.fixes[i].lat, flight.fixes[i].lon]);
    }
    return pts;
  }, [highlight, flight]);

  const zoomPositions = useMemo<[number, number][] | null>(() => {
    if (!zoomTo) return null;
    return [
      [flight.fixes[zoomTo.startIdx].lat, flight.fixes[zoomTo.startIdx].lon],
      [flight.fixes[zoomTo.endIdx].lat, flight.fixes[zoomTo.endIdx].lon],
    ];
  }, [zoomTo, flight]);

  const hover = hoverIdx != null ? flight.fixes[hoverIdx] : null;

  return (
    <div className="map-wrap card">
      <MapContainer
        bounds={bounds}
        boundsOptions={{ padding: [24, 24] }}
        preferCanvas
        scrollWheelZoom
        className="leaflet-map"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />

        {segments.map((seg, i) => (
          <Polyline
            key={i}
            positions={seg.positions}
            pathOptions={{ color: seg.color, weight: 3, opacity: 0.9 }}
          />
        ))}

        {highlightPositions && (
          <>
            <Polyline
              positions={highlightPositions}
              pathOptions={{ color: "#ffffff", weight: 8, opacity: 0.55 }}
            />
            <Polyline
              positions={highlightPositions}
              pathOptions={{ color: PHASE_COLORS[highlight!.kind], weight: 3.5, opacity: 1 }}
            />
          </>
        )}

        <CircleMarker
          center={[launch.lat, launch.lon]}
          radius={7}
          pathOptions={{ color: "#065f46", fillColor: "#10b981", fillOpacity: 1, weight: 2 }}
        >
          <Tooltip>Launch</Tooltip>
        </CircleMarker>
        <CircleMarker
          center={[land.lat, land.lon]}
          radius={7}
          pathOptions={{ color: "#7f1d1d", fillColor: "#ef4444", fillOpacity: 1, weight: 2 }}
        >
          <Tooltip>Landing</Tooltip>
        </CircleMarker>

        {hover && (
          <CircleMarker
            center={[hover.lat, hover.lon]}
            radius={6}
            pathOptions={{ color: "#111827", fillColor: "#ffffff", fillOpacity: 1, weight: 2 }}
          />
        )}

        <FitBounds bounds={bounds} />
        <FlyToSelection positions={zoomPositions} />
      </MapContainer>

      <div className="vario-legend">
        {VARIO_LEGEND.map((l) => (
          <span key={l.label} className="legend-item">
            <i style={{ background: l.color }} /> {l.label}
          </span>
        ))}
        <span className="legend-unit">m/s</span>
      </div>
    </div>
  );
}

function FitBounds({ bounds }: { bounds: L.LatLngBounds }) {
  const map = useMap();
  useEffect(() => {
    map.fitBounds(bounds, { padding: [24, 24] });
  }, [map, bounds]);
  return null;
}

function FlyToSelection({ positions }: { positions: [number, number][] | null }) {
  const map = useMap();
  useEffect(() => {
    if (!positions || positions.length < 2) return;
    map.flyToBounds(L.latLngBounds(positions), { padding: [60, 60], maxZoom: 16, duration: 0.6 });
  }, [map, positions]);
  return null;
}
