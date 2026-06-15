import { useMemo } from "react";
import { createHashRouter, RouterProvider } from "react-router-dom";
import { useEffect } from "react";
import { FlightsListScreen } from "./screens/FlightsListScreen";
import { FlightDetailScreen } from "./screens/FlightDetailScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { maybeAutoBackup } from "./data/drive";
import { loadDb } from "./data/db";

export function AppRoot() {
  useEffect(() => {
    loadDb().then(() => maybeAutoBackup());
  }, []);

  const router = useMemo(
    () =>
      createHashRouter([
        { path: "/", element: <FlightsListScreen /> },
        { path: "/flight/:id", element: <FlightDetailScreen /> },
        { path: "/settings", element: <SettingsScreen /> },
      ]),
    [],
  );

  return (
    <ErrorBoundary>
      <RouterProvider router={router} />
    </ErrorBoundary>
  );
}
