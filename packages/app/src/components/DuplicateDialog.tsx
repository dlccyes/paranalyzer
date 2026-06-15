interface Props {
  fileName: string;
  onReplace: () => void;
  onKeep: () => void;
  onCancel: () => void;
}

export function DuplicateDialog({ fileName, onReplace, onKeep, onCancel }: Props) {
  return (
    <div className="sheet-backdrop" onClick={onCancel}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-header">
          <span className="sheet-title">Duplicate flight</span>
        </div>
        <div style={{ padding: "16px" }}>
          <p className="settings-note" style={{ marginBottom: 16 }}>
            <strong style={{ color: "var(--clr-text)" }}>{fileName}</strong> has the same start
            time as an existing flight. What would you like to do?
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button className="btn" onClick={onReplace}>Replace existing</button>
            <button className="btn btn-ghost" onClick={onKeep}>Keep both</button>
            <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}
