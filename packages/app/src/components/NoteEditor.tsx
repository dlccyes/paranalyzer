import { useState } from "react";

interface Props {
  value: string;
  onSave: (text: string) => Promise<void>;
}

export function NoteEditor({ value, onSave }: Props) {
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);

  const dirty = draft !== value;

  const handleSave = async () => {
    setSaving(true);
    try { await onSave(draft); } finally { setSaving(false); }
  };

  return (
    <div className="note-editor card">
      <div className="panel-title">Note</div>
      <div className="note-body">
        <textarea
          className="note-textarea"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a note about this flight…"
          rows={3}
        />
        {dirty && (
          <button className="btn btn-sm" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        )}
      </div>
    </div>
  );
}
