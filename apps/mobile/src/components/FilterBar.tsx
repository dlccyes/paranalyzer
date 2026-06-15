import type { FilterRule, FieldId, FilterOp } from "../data/model";
import { FIELD_LABELS, ALL_FIELDS } from "../data/model";

interface Props {
  filters: FilterRule[];
  onChange: (filters: FilterRule[]) => void;
}

const TEXT_FIELDS: FieldId[] = ["pilot", "site", "glider", "note"];
const DATE_FIELDS: FieldId[] = ["startTime"];

function opsFor(field: FieldId): FilterOp[] {
  if (TEXT_FIELDS.includes(field)) return ["contains", "equals"];
  if (DATE_FIELDS.includes(field)) return ["dateOnOrAfter", "dateOnOrBefore"];
  return ["gte", "lte", "between"];
}

export function FilterBar({ filters, onChange }: Props) {
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
          const ops = opsFor(rule.field);
          return (
            <div key={i} className="filter-rule">
              <select
                value={rule.field}
                onChange={(e) => {
                  const field = e.target.value as FieldId;
                  updateFilter(i, { field, op: opsFor(field)[0], value: "" });
                }}
              >
                {ALL_FIELDS.map((f) => (
                  <option key={f} value={f}>{FIELD_LABELS[f]}</option>
                ))}
              </select>
              <select
                value={rule.op}
                onChange={(e) => updateFilter(i, { op: e.target.value as FilterOp, value: "" })}
              >
                {ops.map((op) => <option key={op} value={op}>{op}</option>)}
              </select>
              {rule.op === "between" ? (
                <>
                  <input
                    type="number"
                    placeholder="min"
                    value={Array.isArray(rule.value) ? rule.value[0] : ""}
                    onChange={(e) => updateFilter(i, { value: [Number(e.target.value), Array.isArray(rule.value) ? rule.value[1] : 0] })}
                  />
                  <input
                    type="number"
                    placeholder="max"
                    value={Array.isArray(rule.value) ? rule.value[1] : ""}
                    onChange={(e) => updateFilter(i, { value: [Array.isArray(rule.value) ? rule.value[0] : 0, Number(e.target.value)] })}
                  />
                </>
              ) : (
                <input
                  type={DATE_FIELDS.includes(rule.field) ? "date" : TEXT_FIELDS.includes(rule.field) ? "text" : "number"}
                  value={Array.isArray(rule.value) ? "" : String(rule.value)}
                  onChange={(e) => updateFilter(i, { value: e.target.value })}
                  placeholder="value"
                />
              )}
              <button className="btn btn-sm btn-ghost" onClick={() => removeFilter(i)}>✕</button>
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
