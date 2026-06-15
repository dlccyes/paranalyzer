import type { ColumnConfig } from "../data/model";
import { FIELD_LABELS } from "../data/model";

interface Props {
  columns: ColumnConfig[];
  onChange: (cols: ColumnConfig[]) => void;
  onClose: () => void;
}

export function ColumnConfigSheet({ columns, onChange, onClose }: Props) {
  const toggle = (i: number) => {
    const next = columns.map((c, idx) => (idx === i ? { ...c, visible: !c.visible } : c));
    onChange(next);
  };

  const move = (i: number, dir: -1 | 1) => {
    const next = [...columns];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-header">
          <span className="sheet-title">Columns</span>
          <button className="btn btn-sm btn-ghost" onClick={onClose}>Done</button>
        </div>
        <div className="sheet-scroll">
          {columns.map((col, i) => (
            <div key={col.id} className="col-row">
              <label className="col-check">
                <input type="checkbox" checked={col.visible} onChange={() => toggle(i)} />
                <span>{FIELD_LABELS[col.id]}</span>
              </label>
              <div className="col-reorder">
                <button className="btn btn-xs btn-ghost" onClick={() => move(i, -1)} disabled={i === 0}>▲</button>
                <button className="btn btn-xs btn-ghost" onClick={() => move(i, 1)} disabled={i === columns.length - 1}>▼</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
