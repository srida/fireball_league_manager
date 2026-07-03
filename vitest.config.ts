import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["engine/**/*.test.ts", "batch/**/*.test.ts"],
  },
});
