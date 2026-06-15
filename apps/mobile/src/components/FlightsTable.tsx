import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
  type VisibilityState,
  type ColumnOrderState,
} from "@tanstack/react-table";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import type { FlightRecord, FieldId, SortRule, ColumnConfig, FilterRule } from "../data/model";
import { FIELD_LABELS } from "../data/model";
import { makeFormatter, formatDuration, formatDate, formatClock, compassName } from "@paranalyzer/core";
import type { UnitSystem } from "@paranalyzer/core";

const helper = createColumnHelper<FlightRecord>();

function buildColumns(units: UnitSystem) {
  const fmt = makeFormatter(units);

  const col = (id: FieldId, cell: (v: FlightRecord) => string) =>
    helper.accessor(id as keyof FlightRecord, {
      id,
      header: FIELD_LABELS[id],
      cell: (info) => cell(info.row.original),
      enableSorting: true,
    });

  return [
    col("startTime", (r) =>
      r.tzOffsetMinutes != null
        ? `${formatDate(r.startTime, r.tzOffsetMinutes)} ${formatClock(r.startTime, r.tzOffsetMinutes)}`
        : formatDate(r.startTime, 0)
    ),
    col("glider", (r) => r.glider ?? "—"),
    col("site", (r) => r.site ?? "—"),
    col("pilot", (r) => r.pilot ?? "—"),
    col("airtime", (r) => formatDuration(r.airtime, true)),
    col("timeInThermal", (r) => formatDuration(r.timeInThermal)),
    col("timeInRidge", (r) => formatDuration(r.timeInRidge)),
    col("maxAlt", (r) => fmt.altitude(r.maxAlt)),
    col("maxAltGain", (r) => fmt.altitude(r.maxAltGain)),
    col("maxClimb", (r) => fmt.vario(r.maxClimb)),
    col("maxSink", (r) => fmt.vario(-r.maxSink)),
    col("trackLength", (r) => fmt.distance(r.trackLength)),
    col("straightDistance", (r) => fmt.distance(r.straightDistance)),
    col("freeDistance", (r) => fmt.distance(r.freeDistance)),
    col("avgSpeed", (r) => fmt.speed(r.avgSpeed)),
    col("thermalCount", (r) => String(r.thermalCount)),
    col("glideCount", (r) => String(r.glideCount)),
    col("ridgeCount", (r) => String(r.ridgeCount)),
    col("windSpeed", (r) => r.windSpeed != null ? fmt.speed(r.windSpeed) : "—"),
    col("windFromDeg", (r) => r.windFromDeg != null ? `${compassName(r.windFromDeg)} ${Math.round(r.windFromDeg)}°` : "—"),
    col("note", (r) => r.note || ""),
  ];
}

function makeFilterFn(rule: FilterRule): (rec: FlightRecord) => boolean {
  const { field, op, value } = rule;
  const key = field as keyof FlightRecord;
  return (rec) => {
    const raw = rec[key];
    if (raw == null) return false;
    if (op === "contains") return String(raw).toLowerCase().includes(String(value).toLowerCase());
    if (op === "equals") return String(raw).toLowerCase() === String(value).toLowerCase();
    const num = typeof raw === "number" ? raw : parseFloat(String(raw));
    if (op === "gte") return num >= Number(value);
    if (op === "lte") return num <= Number(value);
    if (op === "between" && Array.isArray(value)) return num >= value[0] && num <= value[1];
    if (op === "dateOnOrAfter") return num >= new Date(String(value)).getTime();
    if (op === "dateOnOrBefore") return num <= new Date(String(value)).getTime() + 86400000;
    return true;
  };
}

interface Props {
  flights: FlightRecord[];
  sortRule: SortRule;
  columns: ColumnConfig[];
  filters: FilterRule[];
  units: UnitSystem;
  onSortChange: (s: SortRule) => void;
  onColumnChange: (cols: ColumnConfig[]) => void;
  onDeleteFlight: (id: string) => void;
}

export function FlightsTable({
  flights,
  sortRule,
  columns,
  filters,
  units,
  onSortChange,
  onDeleteFlight,
}: Props) {
  const navigate = useNavigate();
  const [contextMenu, setContextMenu] = useState<{ id: string; x: number; y: number } | null>(null);

  const columnOrder: ColumnOrderState = columns.map((c) => c.id);
  const visibility: VisibilityState = Object.fromEntries(columns.map((c) => [c.id, c.visible]));

  const [sorting, setSorting] = useState<SortingState>([
    { id: sortRule.field, desc: sortRule.dir === "desc" },
  ]);

  const filteredData = flights.filter((rec) =>
    filters.every((rule) => makeFilterFn(rule)(rec)),
  );

  const table = useReactTable({
    data: filteredData,
    columns: buildColumns(units),
    state: { sorting, columnVisibility: visibility, columnOrder },
    onSortingChange: (updater) => {
      const next = typeof updater === "function" ? updater(sorting) : updater;
      setSorting(next);
      if (next[0]) {
        onSortChange({ field: next[0].id as FieldId, dir: next[0].desc ? "desc" : "asc" });
      }
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <>
      {contextMenu && (
        <div
          className="context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={() => setContextMenu(null)}
        >
          <button
            className="context-item danger"
            onClick={() => {
              if (confirm("Delete this flight?")) {
                onDeleteFlight(contextMenu.id);
              }
              setContextMenu(null);
            }}
          >
            Delete flight
          </button>
        </div>
      )}
      {contextMenu && <div className="context-backdrop" onClick={() => setContextMenu(null)} />}

      <div className="flights-table-wrap">
        <table className="flights-table">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    className={header.column.getCanSort() ? "sortable" : ""}
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {header.column.getIsSorted() === "asc" ? " ▲" : header.column.getIsSorted() === "desc" ? " ▼" : ""}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={columns.filter((c) => c.visible).length} className="empty-row">
                  No flights yet — tap "+ Import" to add one.
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => navigate(`/flight/${row.original.id}`)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setContextMenu({ id: row.original.id, x: e.clientX, y: e.clientY });
                  }}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
