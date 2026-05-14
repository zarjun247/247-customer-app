import { defineConfig } from "vitest/config";
import path from "path";

const templateRoot = path.resolve(import.meta.dirname);

export default defineConfig({
  root: templateRoot,
  resolve: {
    alias: {
      "@": path.resolve(templateRoot, "client", "src"),
      "@shared": path.resolve(templateRoot, "shared"),
      "@assets": path.resolve(templateRoot, "attached_assets"),
    },
  },
  test: {
    environment: "node",
    include: [
      "server/**/*.test.ts",
      "server/**/*.spec.ts",
      "client/src/components/barcode/**/*.test.ts",
    ],
    coverage: {
      provider: "v8",
      include: ["server/**/*.ts", "shared/**/*.ts"],
      exclude: [
        "server/**/*.test.ts",
        "server/**/*.spec.ts",
        "server/testUtils/**",
        "drizzle/**",
      ],
      thresholds: {
        // Real floor measured 2026-05-14: stmt 37.25%, branch 69.45%, fn 46.94%, lines 37.25%
        // Set 1% below observed to absorb noise; tighten as gap-fill tests are added.
        statements: 36,
        branches: 68,
        functions: 45,
        lines: 36,
      },
      reporter: ["text", "lcov"],
      reportsDirectory: "coverage",
    },
  },
});
