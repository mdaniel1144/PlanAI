import { builtinModules } from "node:module";
import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";

const nodeImports = [
  ...new Set(builtinModules.map((name) => name.replace(/^node:/, ""))),
  "node:*",
];
const databaseImports = [
  "better-sqlite3",
  "drizzle-orm",
  "drizzle-orm/*",
  "express",
  "multer",
];
const appImports = [
  "@habitat/frontend",
  "@habitat/frontend/*",
  "@habitat/server",
  "@habitat/server/*",
  "**/frontend/**",
  "**/server/**",
  "**/apps/api/**",
];
const uiImports = [
  "react",
  "react/*",
  "react-dom",
  "react-dom/*",
  "react-router-dom",
  "three",
  "three/*",
  "@react-three/*",
];
const builtinNames = new Set(nodeImports.filter((name) => name !== "node:*"));
const restricted = (groups, message) => [
  "error",
  {
    paths: groups
      .filter((name) => builtinNames.has(name))
      .map((name) => ({ name, message })),
    patterns: [
      { group: groups.filter((name) => !builtinNames.has(name)), message },
    ],
  },
];
export default defineConfig([
  globalIgnores([
    "**/dist/**",
    "**/node_modules/**",
    "test-results/**",
    "playwright-report/**",
  ]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
  },
  {
    files: ["frontend/src/**/*.{ts,tsx}"],
    extends: [reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
    languageOptions: { globals: globals.browser },
    rules: {
      "no-restricted-imports": restricted(
        [...nodeImports, ...databaseImports, ...appImports],
        "Browser code uses shared packages and HTTP; server and Node implementations are forbidden.",
      ),
      "no-restricted-globals": [
        "error",
        "process",
        "Buffer",
        "global",
        "require",
        "__dirname",
        "__filename",
        "module",
        "exports",
      ],
    },
  },
  {
    files: ["packages/**/*.ts"],
    rules: {
      "no-restricted-imports": restricted(
        [
          ...nodeImports,
          ...databaseImports,
          ...appImports,
          ...uiImports,
          "vite",
          "vite/*",
        ],
        "Shared packages must remain independent of application runtimes and presentation libraries.",
      ),
    },
  },
  {
    files: ["server/**/*.ts"],
    languageOptions: { globals: globals.node },
    rules: {
      "no-restricted-imports": restricted(
        [
          "@habitat/frontend",
          "@habitat/frontend/*",
          "**/frontend/**",
          ...uiImports,
        ],
        "Server code cannot depend on browser presentation code.",
      ),
    },
  },
]);
