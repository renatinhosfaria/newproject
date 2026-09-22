import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        root: __dirname,
        test: { name: "unit", include: ["tests/unit/**/*.test.ts"] },
      },
      {
        extends: true,
        root: __dirname,
        test: { name: "contracts", include: ["tests/contracts/**/*.test.ts"] },
      },
      {
        extends: true,
        root: __dirname,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          testTimeout: 10000,
        },
      },
    ],
  },
  resolve: {
    alias: {
      "@pacaembu/contracts": resolve(
        __dirname,
        "packages/contracts/src/index.ts",
      ),
    },
  },
} as any);
