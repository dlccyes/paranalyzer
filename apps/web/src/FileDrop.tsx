import { useRef, useState } from "react";

interface Props {
  onFile: (name: string, text: string) => void;
  onSample: () => void;
  compact?: boolean;
  error?: string | null;
}

export function FileDrop({ onFile, onSample, compact, error }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const read = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => onFile(file.name, String(reader.result ?? ""));
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) read(file);
  };

  if (compact) {
    return (
      <div className="filedrop-compact">
        <button className="btn" onClick={() => inputRef.current?.click()}>
          Open file
        </button>
        <button className="btn ghost" onClick={onSample}>
          Sample
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".igc,.gpx,.kml"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) read(file);
            e.target.value = "";
          }}
        />
      </div>
    );
  }

  return (
    <div className="filedrop-wrap">
      <div
        className={`filedrop ${dragging ? "dragging" : ""}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
      >
        <div className="filedrop-icon" aria-hidden="true">🪂</div>
        <div className="filedrop-title">Drop a flight track here</div>
        <div className="filedrop-sub">
          or click to browse · <code>.igc</code> <code>.gpx</code> <code>.kml</code>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".igc,.gpx,.kml"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) read(file);
            e.target.value = "";
          }}
        />
      </div>
      <button className="btn sample-btn" onClick={onSample}>
        Try the sample flight →
      </button>
      {error && <div className="filedrop-error">{error}</div>}
    </div>
  );
}
