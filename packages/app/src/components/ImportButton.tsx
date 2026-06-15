import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { importFlights, commitDuplicate, type ImportResult, type DuplicateInfo } from "../data/importFlight";
import { DuplicateDialog } from "./DuplicateDialog";

interface PendingDuplicate {
  result: ImportResult;
  info: DuplicateInfo;
  fileName: string;
}

interface Props {
  onImported?: () => void;
}

export function ImportButton({ onImported }: Props) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [pending, setPending] = useState<PendingDuplicate | null>(null);
  const [queue, setQueue] = useState<ImportResult[]>([]);

  const processResults = async (results: ImportResult[]) => {
    const errs = results.filter((r) => r.error).map((r) => r.error!);
    if (errs.length) setErrors((e) => [...e, ...errs]);

    const dups = results.filter((r) => r.duplicate);
    const successes = results.filter((r) => !r.error && !r.duplicate);

    if (dups.length > 0) {
      const first = dups[0];
      setQueue(dups.slice(1));
      setPending({
        result: first,
        info: first.duplicate!,
        fileName: first.duplicate!.pendingRec.fileName ?? "Unknown",
      });
      if (successes.length === 1) {
        onImported?.();
        navigate(`/flight/${successes[0].id}`);
      } else if (successes.length > 1) {
        onImported?.();
        navigate("/");
      }
      return;
    }

    if (successes.length === 1) {
      onImported?.();
      navigate(`/flight/${successes[0].id}`);
    } else if (successes.length > 1) {
      onImported?.();
      navigate("/");
    }
  };

  const handleImport = async () => {
    setBusy(true);
    setErrors([]);
    try {
      const results = await importFlights();
      await processResults(results);
    } catch (err) {
      setErrors([err instanceof Error ? err.message : "Import failed"]);
    } finally {
      setBusy(false);
    }
  };

  const resolveDuplicate = async (choice: "replace" | "keep" | "cancel") => {
    if (!pending) return;
    if (choice !== "cancel") {
      try {
        const id = await commitDuplicate(pending.info, choice);
        onImported?.();
        navigate(`/flight/${id}`);
      } catch (err) {
        setErrors((e) => [...e, err instanceof Error ? err.message : "Import failed"]);
      }
    }
    setPending(null);
    if (queue.length > 0) {
      const next = queue[0];
      setQueue(queue.slice(1));
      setPending({
        result: next,
        info: next.duplicate!,
        fileName: next.duplicate!.pendingRec.fileName ?? "Unknown",
      });
    }
  };

  return (
    <div>
      <button className="btn btn-primary" onClick={handleImport} disabled={busy}>
        {busy ? "Importing…" : "+ Import"}
      </button>
      {errors.map((e, i) => (
        <div key={i} className="error-toast">{e}</div>
      ))}
      {pending && (
        <DuplicateDialog
          fileName={pending.fileName}
          onReplace={() => resolveDuplicate("replace")}
          onKeep={() => resolveDuplicate("keep")}
          onCancel={() => resolveDuplicate("cancel")}
        />
      )}
    </div>
  );
}
