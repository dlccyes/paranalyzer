import { useCallback, useState } from "react";
import type { Flight } from "@paranalyzer/core";
import { parseTrack, analyzeFlight, type UnitSystem } from "@paranalyzer/core";
import { AnalysisView } from "@paranalyzer/ui";
import { FileDrop } from "./FileDrop";

const SAMPLE_URL = `${import.meta.env.BASE_URL}sample-woodrat.igc`;
const APK_URL =
  (import.meta.env.VITE_APK_URL as string | undefined) ??
  "https://github.com/dlccyes/paranalyzer/releases/download/android-latest/paranalyzer.apk";

export default function App() {
  const [flight, setFlight] = useState<Flight | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [units, setUnits] = useState<UnitSystem>(
    () => (localStorage.getItem("paranalyzer.units") as UnitSystem) || "metric",
  );

  const loadText = useCallback((name: string, text: string) => {
    try {
      const parsed = parseTrack(name, text);
      const analysed = analyzeFlight(parsed);
      setFlight(analysed);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read that file.");
    }
  }, []);

  const loadSample = useCallback(async () => {
    try {
      const res = await fetch(SAMPLE_URL);
      if (!res.ok) throw new Error("Sample flight could not be loaded.");
      loadText("sample-woodrat.igc", await res.text());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sample load failed.");
    }
  }, [loadText]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">🪂</span>
          <div>
            <h1>Paranalyzer</h1>
            <p>Paragliding flight analysis — in your browser</p>
          </div>
        </div>
        <div className="topbar-actions">
          {flight && <FileDrop onFile={loadText} onSample={loadSample} compact />}
          <a className="btn ghost apk-link" href={APK_URL} download>
            📲 Android app
          </a>
        </div>
      </header>

      {!flight ? (
        <main className="hero">
          <FileDrop onFile={loadText} onSample={loadSample} error={error} />
          <ul className="hero-features">
            <li>📊 XContest-style stats: airtime, altitude, climb, distance</li>
            <li>🌀 Thermal breakdown — turns, climb, rate, radius</li>
            <li>➡️ Glide analysis — direction, speed, glide ratio, wind</li>
            <li>🔒 100% client-side — your track never leaves your device</li>
          </ul>
          <p className="apk-note">
            Want to log flights?{" "}
            <a href={APK_URL} download className="apk-link-inline">
              Download the Android app
            </a>{" "}
            — enable "Install unknown apps" for your browser to sideload.
          </p>
        </main>
      ) : (
        <main>
          {error && <div className="filedrop-error inline">{error}</div>}
          <AnalysisView flight={flight} units={units} onUnitsChange={setUnits} />
        </main>
      )}
    </div>
  );
}
