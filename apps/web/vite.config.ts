import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  plugins: [react()],
  // `igc-xc-score` pulls in the `collections` package, which references the
  // Node `global`. Map it to `globalThis` so it runs in the browser.
  define: { global: "globalThis" },
});
