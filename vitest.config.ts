import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^three$/,
        replacement: fileURLToPath(
          new URL(
            "./frontend/node_modules/three/build/three.module.js",
            import.meta.url,
          ),
        ),
      },
    ],
  },
  test: {
    maxWorkers: 2,
    testTimeout: 15000,
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/e2e/**"],
  },
});
