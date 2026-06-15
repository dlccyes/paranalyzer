import { type FilterRule, type FieldId, type FilterOp, FIELD_LABELS, ALL_FIELDS, FIELD_TYPES, type FilterFieldType } from "../data/model";
import { parseHhMm, formatHhMm, type UnitSystem } from "@paranalyzer/core";

interface Props {
  filters: FilterRule[];
  onChange: (filters: FilterRule[]) => void;
  units: UnitSystem;
  sites: string[];
  gliders: string[];
}

const OP_LABELS: Record<FilterOp, string> = {
  contains: "contains",
  equals: "is",
  gte: "≥",
  lte: "≤",
  between: "between",
  dateOnOrAfter: "on or after",
  dateOnOrBefore: "on or before",
};

function opsFor(type: FilterFieldType): FilterOp[] {
  if (type === "text") return ["contains", "equals"];
  if (type === "date") return ["dateOnOrAfter", "dateOnOrBefore"];
  if (type === "enum") return ["equals"];
  return ["gte", "lte", "between"];
}

const M_TO_FT = 3.280839895;
const M_TO_MI = 1 / 1609.344;
const MS_TO_KMH = 3.6;
const MS_TO_MPH = 2.236936292;
const MS_TO_FPM = 196.8503937;

function unitLabel(type: FilterFieldType, units: UnitSystem): string {
  if (type === "altitude") return units === "metric" ? "m" : "ft";
  if (type === "distance") return units === "metric" ? "km" : "mi";
  if (type === "speed") return units === "metric" ? "km/h" : "mph";
  if (type === "vario") return units === "metric" ? "m/s" : "ft/min";
  if (type === "deg") return "°";
  return "";
}

function siToDisplay(si: number, type: FilterFieldType, units: UnitSystem): string {
  if (type === "duration") return formatHhMm(si);
  if (type === "altitude") return String(Math.round(units === "metric" ? si : si * M_TO_FT));
  if (type === "distance") return (units === "metric" ? si * 0.001 : si * M_TO_MI).toFixed(2);
  if (type === "speed") return (units === "metric" ? si * MS_TO_KMH : si * MS_TO_MPH).toFixed(1);
  if (type === "vario") return (units === "metric" ? si : si * MS_TO_FPM).toFixed(1);
  return String(si);
}

function displayToSI(display: string, type: FilterFieldType, units: UnitSystem): number {
  const n = parseFloat(display);
  if (type === "duration") return parseHhMm(display);
  if (type === "altitude") return units === "metric" ? n : n / M_TO_FT;
  if (type === "distance") return units === "metric" ? n * 1000 : n / M_TO_MI;
  if (type === "speed") return units === "metric" ? n / MS_TO_KMH : n / MS_TO_MPH;
  if (type === "vario") return units === "metric" ? n : n / MS_TO_FPM;
  return n;
}

interface ValueInputProps {
  rule: FilterRule;
  type: FilterFieldType;
  units: UnitSystem;
  sites: string[];
  gliders: string[];
  onChange: (value: FilterRule["value"]) => void;
}

function ValueInput({ rule, type, units, sites, gliders, onChange }: ValueInputProps) {
  const ul = unitLabel(type, units);
  const isDuration = type === "duration";
  const isEnum = type === "enum";
  const isDate = type === "date";
  const isText = type === "text";
  const isNumeric = !isDuration && !isEnum && !isDate && !isText;

  if (isEnum) {
    const opts = rule.field === "site" ? sites : rule.field === "glider" ? gliders : [];
    return (
      <select
        className="filter-value"
        value={String(rule.value)}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">— any —</option>
        {opts.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }

  if (isDate) {
    return (
      <input
        type="date"
        className="filter-value"
        value={String(rule.value)}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  if (isText) {
    return (
      <input
        type="text"
        className="filter-value"
        value={String(rule.value)}
        onChange={(e) => onChange(e.target.value)}
        placeholder="value"
      />
    );
  }

  if (rule.op === "between") {
    const [lo, hi] = Array.isArray(rule.value) ? rule.value : [0, 0];
    return (
      <>
        <input
          type={isDuration ? "text" : "number"}
          className="filter-value filter-value-sm"
          value={siToDisplay(lo, type, units)}
          placeholder={isDuration ? "H:MM" : "min"}
          onChange={(e) => onChange([displayToSI(e.target.value, type, units), hi])}
        />
        <span className="filter-sep">–</span>
        <input
          type={isDuration ? "text" : "number"}
          className="filter-value filter-value-sm"
          value={siToDisplay(hi, type, units)}
          placeholder={isDuration ? "H:MM" : "max"}
          onChange={(e) => onChange([lo, displayToSI(e.target.value, type, units)])}
        />
        {ul && <span className="filter-unit">{ul}</span>}
      </>
    );
  }

  const rawVal = Array.isArray(rule.value) ? 0 : typeof rule.value === "number" ? rule.value : 0;
  return (
    <>
      <input
        type={isDuration ? "text" : isNumeric ? "number" : "text"}
        className="filter-value"
        value={isDuration ? siToDisplay(rawVal, "duration", units) : isNumeric ? siToDisplay(rawVal, type, units) : String(rule.value)}
        placeholder={isDuration ? "H:MM" : "value"}
        onChange={(e) => {
          const v = isDuration || isNumeric ? displayToSI(e.target.value, type, units) : e.target.value;
          onChange(v);
        }}
      />
      {ul && <span className="filter-unit">{ul}</span>}
    </>
  );
}

export function FilterBar({ filters, onChange, units, sites, gliders }: Props) {
  const addFilter = () => {
    const f: FilterRule = { field: "startTime", op: "dateOnOrAfter", value: "" };
    onChange([...filters, f]);
  };

  const updateFilter = (i: number, patch: Partial<FilterRule>) => {
    const next = filters.map((f, idx) => (idx === i ? { ...f, ...patch } : f));
    onChange(next);
  };

  const removeFilter = (i: number) => {
    onChange(filters.filter((_, idx) => idx !== i));
  };

  return (
    <div className="filter-bar">
      <div className="filter-rules">
        {filters.map((rule, i) => {
          const type = FIELD_TYPES[rule.field];
          const ops = opsFor(type);
          return (
            <div key={i} className="filter-rule">
              <select
                className="filter-pill"
                value={rule.field}
                onChange={(e) => {
                  const field = e.target.value as FieldId;
                  const t = FIELD_TYPES[field];
                  updateFilter(i, { field, op: opsFor(t)[0], value: "" });
                }}
              >
                {ALL_FIELDS.map((f) => (
                  <option key={f} value={f}>{FIELD_LABELS[f]}</option>
                ))}
              </select>
              <select
                className="filter-pill"
                value={rule.op}
                onChange={(e) => {
                  const op = e.target.value as FilterOp;
                  const val = op === "between" ? [0, 0] as [number, number] : "";
                  updateFilter(i, { op, value: val });
                }}
              >
                {ops.map((op) => <option key={op} value={op}>{OP_LABELS[op]}</option>)}
              </select>
              <ValueInput
                rule={rule}
                type={type}
                units={units}
                sites={sites}
                gliders={gliders}
                onChange={(value) => updateFilter(i, { value })}
              />
              <button className="btn btn-xs btn-ghost filter-remove" onClick={() => removeFilter(i)}>✕</button>
            </div>
          );
        })}
      </div>
      <div className="filter-actions">
        <button className="btn btn-sm" onClick={addFilter}>+ Add filter</button>
        {filters.length > 0 && (
          <button className="btn btn-sm btn-ghost" onClick={() => onChange([])}>Clear all</button>
        )}
      </div>
    </div>
  );
}
