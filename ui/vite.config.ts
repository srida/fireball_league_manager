import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// UI découplée du moteur (CLAUDE.md) : le moteur headless sous /engine est
// importé en TypeScript source directement, jamais dupliqué ni recalculé ici.
export default defineConfig({
  plugins: [react()],
  resolve: {
    preserveSymlinks: true,
  },
  server: {
    fs: {
      allow: [".."],
    },
  },
});
