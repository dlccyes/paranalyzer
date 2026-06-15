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
import { useMemo, useState } from "react";
import type { FlightRecord, FieldId, SortRule, ColumnConfig, FilterRule } from "../data/model";
import { FIELD_LABELS } from "../data/model";
import { makeFormatter, formatDuration, formatDate, formatClock, compassName, type UnitSystem } from "@paranalyzer/core";
import { Arrow } from "@paranalyzer/ui";

const helper = createColumnHelper<FlightRecord>();

function buildColumns(units: UnitSystem, dateFormat: "dmy" | "ymd") {
  const fmt = makeFormatter(units);

  const col = (
    id: FieldId,
    cell: (v: FlightRecord) => React.ReactNode,
    foot?: (rows: FlightRecord[]) => React.ReactNode,
  ) =>
    helper.accessor(id as keyof FlightRecord, {
      id,
      header: FIELD_LABELS[id],
      cell: (info) => cell(info.row.original),
      footer: foot
        ? (info) => foot(info.table.getFilteredRowModel().rows.map((r) => r.original))
        : undefined,
      enableSorting: true,
    });

  const sumOf = (rows: FlightRecord[], key: keyof FlightRecord) =>
    rows.reduce((acc, r) => acc + ((r[key] as number) ?? 0), 0);
  // Only cumulative quantities (durations, distances, counts, points) are summed.
  // Maxima, averages, wind and instant readings have no meaningful total.
  const sumDuration = (id: keyof FlightRecord, withSeconds = false) =>
    (rows: FlightRecord[]) => formatDuration(sumOf(rows, id), withSeconds);
  const sumDistance = (id: keyof FlightRecord) =>
    (rows: FlightRecord[]) => fmt.distance(sumOf(rows, id));
  const sumCount = (id: keyof FlightRecord) =>
    (rows: FlightRecord[]) => String(sumOf(rows, id));

  return [
    col(
      "startTime",
      (r) =>
        r.tzOffsetMinutes != null
          ? `${formatDate(r.startTime, r.tzOffsetMinutes, dateFormat)} ${formatClock(r.startTime, r.tzOffsetMinutes)}`
          : formatDate(r.startTime, 0, dateFormat),
      (rows) => `Total · ${rows.length} flight${rows.length === 1 ? "" : "s"}`,
    ),
    col("glider", (r) => r.glider ?? "—"),
    col("site", (r) => r.site ?? "—"),
    col("pilot", (r) => r.pilot ?? "—"),
    col("airtime", (r) => formatDuration(r.airtime, true), sumDuration("airtime", true)),
    col("timeInThermal", (r) => formatDuration(r.timeInThermal), sumDuration("timeInThermal")),
    col("timeInRidge", (r) => formatDuration(r.timeInRidge), sumDuration("timeInRidge")),
    col("maxAlt", (r) => fmt.altitude(r.maxAlt)),
    col("maxAltGain", (r) => fmt.altitude(r.maxAltGain)),
    col("maxClimb", (r) => fmt.vario(r.maxClimb)),
    col("maxSink", (r) => fmt.vario(-r.maxSink)),
    col("trackLength", (r) => fmt.distance(r.trackLength), sumDistance("trackLength")),
    col("straightDistance", (r) => fmt.distance(r.straightDistance), sumDistance("straightDistance")),
    col("freeDistance", (r) => fmt.distance(r.freeDistance), sumDistance("freeDistance")),
    col("avgSpeed", (r) => fmt.speed(r.avgSpeed)),
    col("thermalCount", (r) => String(r.thermalCount), sumCount("thermalCount")),
    col("glideCount", (r) => String(r.glideCount), sumCount("glideCount")),
    col("ridgeCount", (r) => String(r.ridgeCount), sumCount("ridgeCount")),
    col("windSpeed", (r) => r.windSpeed != null ? fmt.speed(r.windSpeed) : "—"),
    col("windFromDeg", (r) =>
      r.windFromDeg != null ? (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
          <Arrow deg={r.windFromDeg} size={13} />
          {compassName(r.windFromDeg)} {Math.round(r.windFromDeg)}°
        </span>
      ) : "—"
    ),
    col(
      "xcontestPoints",
      (r) => r.xcontestPoints != null ? String(r.xcontestPoints) : "—",
      (rows) => {
        const total = sumOf(rows, "xcontestPoints");
        return total ? String(Math.round(total * 100) / 100) : "";
      },
    ),
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
    if (op === "equals") return value === "" || String(raw).toLowerCase() === String(value).toLowerCase();
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
  dateFormat: "dmy" | "ymd";
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
  dateFormat,
  onSortChange,
  onDeleteFlight,
}: Props) {
  const navigate = useNavigate();
  const [contextMenu, setContextMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [sorting, setSorting] = useState<SortingState>([
    { id: sortRule.field, desc: sortRule.dir === "desc" },
  ]);

  const tableColumns = useMemo(() => buildColumns(units, dateFormat), [units, dateFormat]);

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
          {table.getRowModel().rows.length > 0 && (
            <tfoot>
              {table.getFooterGroups().map((fg) => (
                <tr key={fg.id}>
                  {fg.headers.map((header) => (
                    <td key={header.id}>
                      {header.column.columnDef.footer
                        ? flexRender(header.column.columnDef.footer, header.getContext())
                        : null}
                    </td>
                  ))}
                </tr>
              ))}
            </tfoot>
          )}
        </table>
      </div>
    </>
  );
}
