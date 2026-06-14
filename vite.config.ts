import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Pure frontend SPA. `base: "./"` keeps asset paths relative so the built
// `dist/` folder can be opened from any static host (or a subpath).
export default defineConfig({
  base: "./",
  plugins: [react()],
});
