import type { FlightRecord, FilterRule } from "./model";

export function makeFilterFn(rule: FilterRule): (rec: FlightRecord) => boolean {
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

export function applyFilters(flights: FlightRecord[], filters: FilterRule[]): FlightRecord[] {
  if (filters.length === 0) return flights;
  return flights.filter((rec) => filters.every((rule) => makeFilterFn(rule)(rec)));
}
