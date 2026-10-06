import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { readFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  ownerUserId: text("owner_user_id"),
  name: text("name").notNull(),
  description: text("description").notNull(),
  units: text("units").notNull(),
  createdAt: text("created_at").notNull(),
  isDemo: integer("is_demo", { mode: "boolean" }).notNull(),
});
export function openDatabase(path: string) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const sqlite = new Database(path);
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("secure_delete = ON");
  sqlite.exec(
    "CREATE TABLE IF NOT EXISTS migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)",
  );
  for (const name of [
    "0001_foundation",
    "0002_entity_properties",
    "0003_snapshot_order",
    "0004_source_foundation",
    "0005_current_scene_only",
    "0006_state_revision",
    "0007_spaces",
    "0008_window_assemblies",
    "0009_authentication",
    "0010_items_catalog",
    "0011_project_ownership",
    "0012_fixed_product_colors",
    "0013_dimension_verification",
    "0014_display_preferences",
    "0015_blue_theme",
    "0016_placement_asset_pin",
  ]) {
    if (!sqlite.prepare("SELECT name FROM migrations WHERE name=?").get(name)) {
      const sql = readFileSync(
        new URL(`../../../migrations/${name}.sql`, import.meta.url),
        "utf8",
      );
      sqlite.transaction(() => {
        sqlite.pragma("defer_foreign_keys = ON");
        sqlite.exec(sql);
        sqlite
          .prepare("INSERT INTO migrations VALUES (?,?)")
          .run(name, new Date().toISOString());
      })();
      if (name === "0005_current_scene_only") {
        sqlite.pragma("wal_checkpoint(TRUNCATE)");
        sqlite.exec("VACUUM");
      }
    }
  }
  return { sqlite, orm: drizzle(sqlite) };
}
export type Db = ReturnType<typeof openDatabase>;
