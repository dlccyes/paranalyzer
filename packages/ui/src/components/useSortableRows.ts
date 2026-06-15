import { useState, useMemo } from "react";

type Dir = "asc" | "desc";

interface Column<T> {
  key: string;
  accessor: (row: T) => number | string | null | undefined;
}

interface SortableRows<T> {
  sorted: T[];
  sortKey: string | null;
  sortDir: Dir;
  toggle: (key: string) => void;
  indicator: (key: string) => string;
}

export function useSortableRows<T>(rows: T[], columns: Column<T>[]): SortableRows<T> {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<Dir>("asc");

  const colMap = useMemo(
    () => Object.fromEntries(columns.map((c) => [c.key, c.accessor])),
    [columns],
  );

  const sorted = useMemo(() => {
    if (!sortKey || !colMap[sortKey]) return rows;
    const acc = colMap[sortKey];
    return [...rows].sort((a, b) => {
      const av = acc(a) ?? "";
      const bv = acc(b) ?? "";
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [rows, sortKey, sortDir, colMap]);

  function toggle(key: string) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function indicator(key: string) {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? " ▲" : " ▼";
  }

  return { sorted, sortKey, sortDir, toggle, indicator };
}
