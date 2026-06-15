import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { importFlights } from "../data/importFlight";

export function ImportButton() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const handleImport = async () => {
    setBusy(true);
    setErrors([]);
    try {
      const results = await importFlights();
      const errs = results.filter((r) => r.error).map((r) => r.error!);
      if (errs.length) setErrors(errs);
      const success = results.filter((r) => !r.error);
      if (success.length === 1) {
        navigate(`/flight/${success[0].id}`);
      } else if (success.length > 1) {
        navigate("/");
      }
    } catch (err) {
      setErrors([err instanceof Error ? err.message : "Import failed"]);
    } finally {
      setBusy(false);
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
    </div>
  );
}
