import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, resolve, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { isBuiltin } from "node:module";
import ts from "typescript";
import {
  workspaceRoot,
  databasePath,
  storagePath,
} from "../server/src/runtime-paths";

const root = fileURLToPath(new URL("../", import.meta.url));
type Manifest = {
  name: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  exports?: string | Record<string, string>;
};
const folders = [
  "frontend",
  "server",
  "packages/domain",
  "packages/contracts",
  "packages/geometry",
];
const manifests = new Map(
  folders.map((folder) => [
    folder,
    JSON.parse(
      readFileSync(resolve(root, folder, "package.json"), "utf8"),
    ) as Manifest,
  ]),
);
const packageFolders = new Map(
  [...manifests].map(([folder, m]) => [m.name, folder]),
);
const allowed: Record<string, string[]> = {
  frontend: ["packages/domain", "packages/contracts", "packages/geometry"],
  server: ["packages/domain", "packages/contracts", "packages/geometry"],
  "packages/domain": [],
  "packages/contracts": ["packages/domain"],
  "packages/geometry": ["packages/domain"],
};
function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(dir, entry.name);
    return entry.isDirectory()
      ? files(path)
      : /\.tsx?$/.test(path)
        ? [path]
        : [];
  });
}
const sourceFiles = folders.flatMap((folder) =>
  files(resolve(root, folder, "src")),
);
const owner = (path: string) =>
  folders.find((folder) => path.startsWith(resolve(root, folder) + sep));
function imports(file: string) {
  const source = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
    ),
    values: string[] = [];
  const visit = (node: ts.Node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    )
      values.push(node.moduleSpecifier.text);
    if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) &&
          node.expression.text === "require"))
    ) {
      const arg = node.arguments[0];
      if (!arg || !ts.isStringLiteral(arg))
        throw new Error(`Non-literal dependency in ${file}`);
      values.push(arg.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return values;
}
const moduleName = (specifier: string) =>
  specifier.startsWith("@")
    ? specifier.split("/").slice(0, 2).join("/")
    : specifier.split("/")[0];
function localTarget(file: string, specifier: string) {
  const base = resolve(dirname(file), specifier);
  return [base, `${base}.ts`, `${base}.tsx`, resolve(base, "index.ts")].find(
    (path) => existsSync(path),
  );
}
function sharedTarget(specifier: string) {
  const name = moduleName(specifier),
    folder = packageFolders.get(name);
  if (!folder) return undefined;
  const exports = manifests.get(folder)!.exports;
  const key = specifier === name ? "." : "." + specifier.slice(name.length);
  const target =
    typeof exports === "string"
      ? key === "."
        ? exports
        : undefined
      : exports?.[key];
  if (!target) throw new Error(`Non-exported workspace entry: ${specifier}`);
  return resolve(root, folder, target);
}

describe("workspace boundaries", () => {
  it("declares dependencies in their owning package and forbids reversed workspace edges", () => {
    const forbidden = [
      "react",
      "react-dom",
      "react-router-dom",
      "three",
      "@react-three/fiber",
      "@react-three/drei",
      "better-sqlite3",
      "drizzle-orm",
      "express",
      "multer",
    ];
    for (const [folder, manifest] of manifests)
      for (const dependency of Object.keys(manifest.dependencies ?? {})) {
        const target = packageFolders.get(dependency);
        if (target)
          expect(allowed[folder], `${folder} → ${target}`).toContain(target);
        if (folder.startsWith("packages/"))
          expect(forbidden).not.toContain(dependency);
        if (folder === "frontend")
          expect([
            "better-sqlite3",
            "drizzle-orm",
            "express",
            "multer",
          ]).not.toContain(dependency);
      }
  });
  it("keeps every production import in its layer or an exported, declared shared package", () => {
    for (const file of sourceFiles) {
      const from = owner(file)!;
      for (const specifier of imports(file)) {
        if (isBuiltin(specifier)) {
          expect(from, `${relative(root, file)} imports ${specifier}`).toBe(
            "server",
          );
          continue;
        }
        if (specifier.startsWith(".")) {
          const target = localTarget(file, specifier);
          expect(target, `${file}: missing ${specifier}`).toBeDefined();
          expect(
            owner(target!),
            `Cross-package relative import in ${file}`,
          ).toBe(from);
          continue;
        }
        const name = moduleName(specifier);
        expect(
          manifests.get(from)!.dependencies,
          `${file}: undeclared ${name}`,
        ).toHaveProperty(name);
        const target = sharedTarget(specifier);
        if (target)
          expect(allowed[from], `${from} → ${owner(target)}`).toContain(
            owner(target),
          );
      }
    }
  });
  it("has no cycles in the production source graph, including lazy and type imports", () => {
    const graph = new Map(
      sourceFiles.map((file) => [
        file,
        imports(file).flatMap((specifier) => {
          const target = specifier.startsWith(".")
            ? localTarget(file, specifier)
            : sharedTarget(specifier);
          return target && sourceFiles.includes(target) ? [target] : [];
        }),
      ]),
    );
    const complete = new Set<string>(),
      active = new Set<string>();
    function visit(file: string, chain: string[]) {
      if (complete.has(file)) return;
      if (active.has(file))
        throw new Error(
          `Dependency cycle: ${[...chain, file].map((p) => relative(root, p)).join(" → ")}`,
        );
      active.add(file);
      for (const target of graph.get(file) ?? [])
        visit(target, [...chain, file]);
      active.delete(file);
      complete.add(file);
    }
    for (const file of sourceFiles) visit(file, []);
    expect(complete.size).toBe(sourceFiles.length);
  });
  it("keeps database and storage locations anchored to the workspace across package launch directories", () => {
    expect(resolve(workspaceRoot)).toBe(resolve(root));
    expect(databasePath()).toBe(resolve(root, "data/habitat.sqlite"));
    expect(storagePath()).toBe(resolve(root, "storage"));
    expect(databasePath("data/custom.sqlite")).toBe(
      resolve(root, "data/custom.sqlite"),
    );
    expect(databasePath("/tmp/habitat-absolute.sqlite")).toBe(
      "/tmp/habitat-absolute.sqlite",
    );
    expect(databasePath(":memory:")).toBe(":memory:");
    expect(storagePath("storage/custom")).toBe(resolve(root, "storage/custom"));
  });
});
