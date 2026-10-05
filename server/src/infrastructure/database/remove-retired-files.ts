import type Database from "better-sqlite3";
import { rmSync, rmdirSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";

// Upgrade-only cleanup. Recorded keys survive failures so startup can retry.
export function removeRetiredFiles(
  sqlite: Database.Database,
  storageRoot: string,
) {
  if (
    !sqlite
      .prepare(
        "SELECT name FROM sqlite_master WHERE name='retired_storage_files'",
      )
      .get()
  )
    return;
  const root = resolve(storageRoot);
  const rows = sqlite
    .prepare("SELECT storage_key AS key FROM retired_storage_files")
    .all() as { key: string }[];
  for (const { key } of rows) {
    const path = resolve(root, key);
    if (!path.startsWith(root + sep))
      throw new Error("Invalid retired storage key");
    rmSync(path, { force: true });
    sqlite
      .prepare("DELETE FROM retired_storage_files WHERE storage_key=?")
      .run(key);
    for (
      let dir = dirname(path);
      dir.startsWith(root + sep) || dir === root;
      dir = dirname(dir)
    ) {
      try {
        rmdirSync(dir);
      } catch {
        break;
      }
    }
  }
  sqlite.exec("DROP TABLE retired_storage_files");
  sqlite.pragma("wal_checkpoint(TRUNCATE)");
  sqlite.exec("VACUUM");
}
