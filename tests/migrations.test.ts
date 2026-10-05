import { it, expect } from "vitest";
import Database from "better-sqlite3";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createFixture, demoProject, uuid } from "@habitat/domain/fixture";
import { entitiesOf, isProtected } from "@habitat/domain";
import { openDatabase } from "../server/src/infrastructure/database/database";
import { Repository } from "../server/src/infrastructure/database/repository";
it("upgrades populated original snapshots without losing architectural data", () => {
  const root = mkdtempSync(join(tmpdir(), "habitat-upgrade-")),
    path = join(root, "legacy.sqlite"),
    scene = createFixture(),
    vid = uuid(990),
    time = new Date().toISOString();
  const legacy = new Database(path);
  legacy.pragma("foreign_keys=ON");
  legacy.exec(
    readFileSync(
      new URL("../server/migrations/0001_foundation.sql", import.meta.url),
      "utf8",
    ),
  );
  legacy.exec(
    "CREATE TABLE migrations(name TEXT PRIMARY KEY,applied_at TEXT NOT NULL)",
  );
  legacy
    .prepare("INSERT INTO migrations VALUES (?,?)")
    .run("0001_foundation", time);
  legacy.transaction(() => {
    legacy
      .prepare("INSERT INTO projects VALUES (?,?,?,?,?,?)")
      .run(
        demoProject.id,
        demoProject.name,
        demoProject.description,
        "m",
        demoProject.createdAt,
        1,
      );
    legacy
      .prepare("INSERT INTO home_scenes VALUES (?,?,?)")
      .run(scene.id, scene.projectId, 1);
    legacy
      .prepare("INSERT INTO scene_versions VALUES (?,?,?,?,?,?,?,?,?)")
      .run(vid, scene.id, 1, null, null, "Legacy snapshot", time, 1, "m");
    for (const e of scene.evidence)
      legacy
        .prepare("INSERT INTO evidence VALUES (?,?,?,?)")
        .run(vid, e.id, null, JSON.stringify(e));
    for (const f of scene.floors) {
      legacy
        .prepare("INSERT INTO floors VALUES (?,?,?,?,?)")
        .run(vid, f.id, f.name, f.elevation, JSON.stringify(f.scale));
      for (const e of entitiesOf(f)) {
        legacy
          .prepare("INSERT INTO entities VALUES (?,?,?,?,?,?,?,?,?,?)")
          .run(
            vid,
            f.id,
            e.id,
            e.kind,
            "wallId" in e ? e.wallId : null,
            "leftRoomId" in e ? e.leftRoomId : null,
            "rightRoomId" in e ? e.rightRoomId : null,
            "fromRoomId" in e ? e.fromRoomId : null,
            "toRoomId" in e ? e.toRoomId : null,
            JSON.stringify(e),
          );
        for (const evidenceId of e.evidenceIds)
          legacy
            .prepare("INSERT INTO entity_evidence VALUES (?,?,?)")
            .run(vid, e.id, evidenceId);
      }
    }
  })();
  legacy.close();
  const db = openDatabase(path);
  try {
    expect(new Repository(db).scene(scene.id)).toEqual(scene);
    const wall = db.sqlite
      .prepare(
        "SELECT height,data_json AS data FROM entities WHERE kind='wall' LIMIT 1",
      )
      .get() as { height: number; data: string };
    expect(wall.height).toBe(2.8);
    expect(JSON.parse(wall.data)).not.toHaveProperty("height");
    expect(() =>
      db.sqlite
        .prepare("UPDATE entities SET thickness=-1 WHERE kind='wall'")
        .run(),
    ).toThrow(/CHECK/);
    expect(db.sqlite.pragma("foreign_key_check")).toEqual([]);
  } finally {
    db.sqlite.close();
    rmSync(root, { recursive: true, force: true });
  }
});
it("protects separately verified room boundaries even when overall detection is unknown", () => {
  const room = createFixture().floors[0].rooms[0];
  room.verification = "UNKNOWN";
  room.semantic.verification = "UNKNOWN";
  expect(isProtected(room)).toBe(true);
  room.geometry.verification = "UNKNOWN";
  expect(isProtected(room)).toBe(false);
});

it("removes old snapshots and uploaded files while preserving the latest geometry", async () => {
  const { mkdirSync, writeFileSync, existsSync } = await import("node:fs");
  const { createApp } = await import("../server/src/app");
  const { entityRecord, insertEntitySql } =
    await import("../server/src/infrastructure/database/entity-records");
  const root = mkdtempSync(join(tmpdir(), "habitat-removal-"));
  const path = join(root, "legacy.sqlite"),
    storage = join(root, "storage");
  const legacy = new Database(path),
    time = new Date().toISOString();
  legacy.pragma("foreign_keys=ON");
  legacy.exec(
    "CREATE TABLE migrations(name TEXT PRIMARY KEY,applied_at TEXT NOT NULL)",
  );
  for (const name of [
    "0001_foundation",
    "0002_entity_properties",
    "0003_snapshot_order",
    "0004_source_foundation",
  ]) {
    legacy.exec(
      readFileSync(
        new URL(`../server/migrations/${name}.sql`, import.meta.url),
        "utf8",
      ),
    );
    legacy.prepare("INSERT INTO migrations VALUES (?,?)").run(name, time);
  }
  const current = createFixture();
  current.revision = 2;
  current.floors[0].rooms[0].name = "Latest room name";
  current.floors[0].walls[0].height = 3.2;
  const artifactId = uuid(991),
    derivedId = uuid(992);
  const sourceKey = `projects/${current.projectId}/source/${artifactId}`;
  const previewKey = `projects/${current.projectId}/derived/${derivedId}.png`;
  mkdirSync(join(storage, `projects/${current.projectId}/source`), {
    recursive: true,
  });
  mkdirSync(join(storage, `projects/${current.projectId}/derived`), {
    recursive: true,
  });
  writeFileSync(join(storage, sourceKey), "old uploaded file");
  writeFileSync(join(storage, previewKey), "old generated preview");
  writeFileSync(join(storage, "unrelated.txt"), "keep me");
  legacy.transaction(() => {
    legacy
      .prepare("INSERT INTO projects VALUES (?,?,?,?,?,?)")
      .run(
        demoProject.id,
        demoProject.name,
        demoProject.description,
        "m",
        time,
        1,
      );
    legacy
      .prepare("INSERT INTO home_scenes VALUES (?,?,?)")
      .run(current.id, current.projectId, 2);
    legacy
      .prepare("INSERT INTO source_artifacts VALUES (?,?,?,?,?,?,?)")
      .run(
        artifactId,
        current.projectId,
        "private-plan.pdf",
        "application/pdf",
        17,
        sourceKey,
        time,
      );
    legacy
      .prepare("INSERT INTO derived_artifacts VALUES (?,?,?,?,?)")
      .run(derivedId, artifactId, previewKey, "image/png", 21);
    for (const scene of [createFixture(), current]) {
      const vid = uuid(990 + scene.revision * 10);
      legacy
        .prepare("INSERT INTO scene_versions VALUES (?,?,?,?,?,?,?,?,?)")
        .run(
          vid,
          scene.id,
          scene.revision,
          scene.revision === 1 ? null : 1,
          null,
          "Historical change",
          time,
          1,
          "m",
        );
      for (const [ordinal, e] of scene.evidence.entries()) {
        legacy.prepare("INSERT INTO evidence VALUES (?,?,?,?,?)").run(
          vid,
          e.id,
          artifactId,
          JSON.stringify({
            ...e,
            sourceArtifactId: artifactId,
            page: 1,
            algorithmVersion: "old-parser",
            sourcePixelCoordinates: [{ x: 2, y: 3 }],
          }),
          ordinal,
        );
      }
      for (const floor of scene.floors) {
        legacy
          .prepare("INSERT INTO floors VALUES (?,?,?,?,?)")
          .run(
            vid,
            floor.id,
            floor.name,
            floor.elevation,
            JSON.stringify(floor.scale),
          );
        for (const entity of entitiesOf(floor)) {
          legacy
            .prepare(
              insertEntitySql
                .replace(",bottom_elevation,top_elevation", "")
                .replace(",@bottomElevation,@topElevation", "")
                .replaceAll("state_id", "version_id")
                .replace(
                  ",enclosure_status,floor_elevation,ceiling_elevation,boundary_source",
                  "",
                )
                .replace(
                  ",@enclosureStatus,@floorElevation,@ceilingElevation,@boundarySource",
                  "",
                ),
            )
            .run(entityRecord(vid, entity));
          for (const [ordinal, eid] of entity.evidenceIds.entries())
            legacy
              .prepare("INSERT INTO entity_evidence VALUES (?,?,?,?)")
              .run(vid, entity.id, eid, ordinal);
        }
      }
    }
  })();
  legacy.close();
  const app = createApp(path, storage);
  try {
    const latest = app.service.requireScene(current.id);
    expect(latest.floors).toEqual(current.floors);
    expect(latest.revision).toBe(2);
    expect(latest.evidence[0]).toEqual({
      id: current.evidence[0].id,
      type: "MANUAL",
      description: "Geometry retained after source uploads were removed.",
    });
    expect(
      app.repo.db.sqlite.prepare("SELECT COUNT(*) AS n FROM scene_state").get(),
    ).toEqual({ n: 1 });
    expect(
      app.repo.db.sqlite.prepare("SELECT COUNT(*) AS n FROM entities").get(),
    ).toEqual({ n: 42 });
    const tables = (
      app.repo.db.sqlite
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all() as { name: string }[]
    ).map((r) => r.name);
    for (const removed of [
      "scene_versions",
      "source_artifacts",
      "plan_pages",
      "derived_artifacts",
      "normalization_runs",
      "analysis_runs",
      "source_claim_links",
      "corrections",
      "verifications",
      "retired_storage_files",
    ])
      expect(tables).not.toContain(removed);
    expect(existsSync(join(storage, sourceKey))).toBe(false);
    expect(existsSync(join(storage, previewKey))).toBe(false);
    expect(readFileSync(join(storage, "unrelated.txt"), "utf8")).toBe(
      "keep me",
    );
    expect(app.repo.db.sqlite.pragma("foreign_key_check")).toEqual([]);
    app.service.correct(current.id, 2, current.floors[0].rooms[0].id, {
      name: "Still editable",
    });
    expect(
      app.repo.db.sqlite.prepare("SELECT COUNT(*) AS n FROM scene_state").get(),
    ).toEqual({ n: 1 });
  } finally {
    app.close();
  }
  const reopened = createApp(path, storage);
  try {
    expect(
      reopened.service.requireScene(current.id).floors[0].rooms[0].name,
    ).toBe("Still editable");
  } finally {
    reopened.close();
    rmSync(root, { recursive: true, force: true });
  }
});

it("adds authentication to a copy of a populated current-state database without changing any existing records", async () => {
  const { createApp } = await import("../server/src/app");
  const root = mkdtempSync(join(tmpdir(), "habitat-auth-upgrade-"));
  const sourcePath = join(root, "populated.sqlite"),
    copyPath = join(root, "copy.sqlite");
  const app = createApp(sourcePath, join(root, "storage"));
  const db = app.repo.db.sqlite;
  // Reconstruct the immediately preceding schema only in this disposable source.
  db.exec(
    "DROP TABLE user_sessions; DROP TABLE users; DELETE FROM migrations WHERE name='0009_authentication'",
  );
  const tables = (
    db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT IN ('migrations','sqlite_sequence') ORDER BY name",
      )
      .all() as { name: string }[]
  ).map((r) => r.name);
  const before = Object.fromEntries(
    tables.map((name) => [
      name,
      db.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all(),
    ]),
  );
  expect((before.projects as unknown[]).length).toBeGreaterThan(0);
  expect((before.entities as unknown[]).length).toBeGreaterThan(0);
  await db.backup(copyPath);
  app.close();
  const upgraded = openDatabase(copyPath);
  try {
    for (const name of tables)
      expect(
        upgraded.sqlite.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all(),
      ).toEqual(before[name]);
    expect(upgraded.sqlite.prepare("SELECT * FROM users").all()).toEqual([]);
    expect(
      upgraded.sqlite.prepare("SELECT * FROM user_sessions").all(),
    ).toEqual([]);
    expect(upgraded.sqlite.pragma("foreign_key_check")).toEqual([]);
    const indexes = upgraded.sqlite
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='user_sessions'",
      )
      .all() as { name: string }[];
    expect(indexes.map((i) => i.name)).toContain("user_sessions_user_id");
    expect(indexes.map((i) => i.name)).toContain("user_sessions_expires_at");
    expect(upgraded.sqlite.pragma("foreign_key_list(user_sessions)")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: "users",
          from: "user_id",
          to: "id",
          on_delete: "CASCADE",
        }),
      ]),
    );
  } finally {
    upgraded.sqlite.close();
    rmSync(root, { recursive: true, force: true });
  }
});
