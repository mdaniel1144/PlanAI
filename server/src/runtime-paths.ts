import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
// Workspace-owned data must not follow the package command's working directory.
export const workspaceRoot = fileURLToPath(new URL("../../", import.meta.url));
export const databasePath = (value = "data/habitat.sqlite") =>
  value === ":memory:" ? value : resolve(workspaceRoot, value);
export const storagePath = (value = "storage") => resolve(workspaceRoot, value);
