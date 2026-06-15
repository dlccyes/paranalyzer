import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ColumnConfig } from "../data/model";
import { FIELD_LABELS } from "../data/model";

interface RowProps {
  col: ColumnConfig;
  onToggle: () => void;
}

function SortableRow({ col, onToggle }: RowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: col.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="col-row">
      <div className="col-drag-handle" {...attributes} {...listeners} title="Drag to reorder">
        ⠿
      </div>
      <label className="col-check">
        <input type="checkbox" checked={col.visible} onChange={onToggle} />
        <span>{FIELD_LABELS[col.id]}</span>
      </label>
    </div>
  );
}

interface Props {
  columns: ColumnConfig[];
  onChange: (cols: ColumnConfig[]) => void;
  onClose: () => void;
}

export function ColumnConfigSheet({ columns, onChange, onClose }: Props) {
  const sensors = useSensors(useSensor(PointerSensor));

  const toggle = (i: number) => {
    const next = columns.map((c, idx) => (idx === i ? { ...c, visible: !c.visible } : c));
    onChange(next);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = columns.findIndex((c) => c.id === active.id);
    const newIdx = columns.findIndex((c) => c.id === over.id);
    onChange(arrayMove(columns, oldIdx, newIdx));
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-header">
          <span className="sheet-title">Columns</span>
          <button className="btn btn-sm btn-ghost" onClick={onClose}>Done</button>
        </div>
        <div className="sheet-scroll">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={columns.map((c) => c.id)} strategy={verticalListSortingStrategy}>
              {columns.map((col, i) => (
                <SortableRow key={col.id} col={col} onToggle={() => toggle(i)} />
              ))}
            </SortableContext>
          </DndContext>
        </div>
      </div>
    </div>
  );
}
