import { it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { openDatabase } from "../server/src/infrastructure/database/database";
import { Repository } from "../server/src/infrastructure/database/repository";
import { SceneService } from "../server/src/modules/scenes/service";
import { demoProject, uuid } from "@habitat/domain/fixture";
import {
  reconnectWalls,
  recomputeSceneSpaces,
  deriveSpacesFromWalls,
} from "@habitat/geometry";
import { spaceFixtures, rectangle, blankScene, wall } from "./space-fixtures";
import { entitiesOf } from "@habitat/domain";
import {
  entityRecord,
  insertEntitySql,
} from "../server/src/infrastructure/database/entity-records";
const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const fn of cleanup.splice(0)) fn();
});
function setup() {
  const db = openDatabase(":memory:"),
    repo = new Repository(db),
    service = new SceneService(repo);
  cleanup.push(() => db.sqlite.close());
  repo.addProject(demoProject);
  const scene = blankScene();
  repo.transaction(() => {
    repo.createScene(scene);
    repo.writeScene(scene);
  });
  return { db, repo, service, scene };
}
it("round-trips CLOSED and PARTIALLY_OPEN, levels and boundary relationships in current state", () => {
  const { repo, service, scene } = setup(),
    next = rectangle(),
    f = next.floors[0],
    partial = spaceFixtures.partiallyOpen().floors[0];
  f.walls.push(
    ...partial.walls.map((w, i) => ({
      ...w,
      id: uuid(3000 + i),
      start: { x: w.start.x + 12, y: w.start.y },
      end: { x: w.end.x + 12, y: w.end.y },
      connectedWallIds: [],
    })),
  );
  reconnectWalls(f);
  const draft = recomputeSceneSpaces(next, scene).scene;
  const closed = draft.floors[0].rooms.find(
      (r) => r.enclosureStatus === "CLOSED",
    )!,
    open = draft.floors[0].rooms.find(
      (r) => r.enclosureStatus === "PARTIALLY_OPEN",
    )!;
  closed.floorElevation = 0;
  closed.ceilingElevation = 3;
  open.floorElevation = 0.45;
  open.ceilingElevation = 3.2;
  const saved = service.save(scene.id, draft, 1);
  expect(repo.scene(scene.id)).toEqual(saved);
  expect(saved.floors[0].rooms).toHaveLength(2);
  expect(
    repo.db.sqlite.prepare("SELECT COUNT(*) n FROM scene_state").get(),
  ).toEqual({ n: 1 });
  expect(repo.db.sqlite.pragma("foreign_key_check")).toEqual([]);
});
it("split and merge replace current rows atomically with deterministic IDs and no orphan edges", () => {
  const { repo, service, scene } = setup();
  let saved = service.save(scene.id, rectangle(), 1);
  const f = saved.floors[0];
  f.rooms[0].name = "Living Room";
  f.rooms[0].type = "living_room";
  saved = service.save(scene.id, saved, 2);
  const before = saved.floors[0].rooms[0].id,
    next = structuredClone(saved);
  next.floors[0].walls.push(
    wall(next.floors[0], { x: 5, y: 0 }, { x: 5, y: 4 }, 10),
  );
  const split = service.save(scene.id, next, 3);
  expect(split.floors[0].rooms).toHaveLength(2);
  expect(split.floors[0].rooms[0]).toMatchObject({
    id: before,
    name: "Living Room",
  });
  expect(repo.scene(scene.id)).toEqual(split);
  const merge = structuredClone(split);
  merge.floors[0].walls = merge.floors[0].walls.filter(
    (w) => w.id !== uuid(1010),
  );
  reconnectWalls(merge.floors[0]);
  const merged = service.save(scene.id, merge, 4);
  expect(merged.floors[0].rooms).toHaveLength(1);
  expect(merged.floors[0].rooms[0].id).toBe(before);
  expect(repo.scene(scene.id)).toEqual(merged);
  expect(
    repo.db.sqlite.prepare("SELECT COUNT(*) n FROM scene_state").get(),
  ).toEqual({ n: 1 });
  expect(
    repo.db.sqlite
      .prepare("SELECT COUNT(*) n FROM entities WHERE kind='room'")
      .get(),
  ).toEqual({ n: 1 });
  expect(repo.db.sqlite.pragma("foreign_key_check")).toEqual([]);
});
it("independently replaces tampered client geometry and area; preserves semantic edits", () => {
  const { repo, service, scene } = setup(),
    saved = service.save(scene.id, rectangle(), 1),
    next = structuredClone(saved),
    r = next.floors[0].rooms[0];
  r.boundary = [
    { x: 20, y: 20 },
    { x: 30, y: 20 },
    { x: 20, y: 30 },
  ];
  r.area = 999;
  r.boundaryEdges = [];
  r.name = "Office";
  r.type = "office";
  const fixed = service.save(scene.id, next, 2);
  expect(fixed.floors[0].rooms[0]).toMatchObject({
    name: "Office",
    type: "office",
    area: 32,
    boundary: saved.floors[0].rooms[0].boundary,
  });
  expect(repo.scene(scene.id)).toEqual(fixed);
});
it("rejects protected topology conflicts and invalid elevations without advancing revision", () => {
  const { repo, service, scene } = setup(),
    saved = service.save(scene.id, rectangle(), 1),
    r = saved.floors[0].rooms[0];
  const verified = service.correct(scene.id, 2, r.id, {}, true);
  expect(verified.floors[0].rooms[0].geometry.verification).toBe("VERIFIED");
  const next = structuredClone(verified);
  next.floors[0].walls.push(
    wall(next.floors[0], { x: 4, y: 0 }, { x: 4, y: 4 }, 10),
  );
  expect(() => service.save(scene.id, next, 3)).toThrow(/protected/);
  expect(repo.scene(scene.id)).toEqual(verified);
  const invalid = structuredClone(verified);
  Object.assign(invalid.floors[0].rooms[0], {
    floorElevation: 0.45,
    ceilingElevation: 0.2,
  });
  expect(() => service.save(scene.id, invalid, 3)).toThrow(/Ceiling/);
  expect(repo.scene(scene.id)).toEqual(verified);
  expect(() => service.save(scene.id, verified, 2)).toThrow(/changed/);
});
it("enforces boundary kind, ownership and numeric constraints and rolls back a failed replacement", () => {
  const { repo, service, scene } = setup(),
    saved = service.save(scene.id, rectangle(), 1),
    f = saved.floors[0],
    r = f.rooms[0],
    db = repo.db.sqlite;
  expect(() =>
    db.prepare("UPDATE space_boundary_edges SET edge_kind='OPEN'").run(),
  ).toThrow(/CHECK/);
  expect(() =>
    db.prepare("UPDATE space_boundary_edges SET wall_id=?").run(r.id),
  ).toThrow(/wall/);
  expect(() =>
    db.prepare("UPDATE space_boundary_edges SET floor_id=?").run(uuid(999)),
  ).toThrow();
  expect(() =>
    db
      .prepare(
        "UPDATE entities SET floor_elevation=2,ceiling_elevation=1 WHERE id=?",
      )
      .run(r.id),
  ).toThrow(/CHECK/);
  const invalid = structuredClone(saved);
  invalid.floors[0].rooms[0].boundaryEdges![0] = {
    index: 0,
    kind: "WALL",
    wallId: uuid(9000),
    start: { x: 0, y: 0 },
    end: { x: 8, y: 0 },
  };
  expect(() => repo.transaction(() => repo.writeScene(invalid))).toThrow();
  expect(repo.scene(scene.id)).toEqual(saved);
});
it("migrates a COPY of a populated pre-Space current-state database without losing current architecture", async () => {
  const root = mkdtempSync(join(tmpdir(), "space-migration-"));
  cleanup.push(() => rmSync(root, { recursive: true, force: true }));
  const oldPath = join(root, "old.sqlite"),
    copyPath = join(root, "copy.sqlite"),
    legacy = new Database(oldPath);
  legacy.exec(
    "CREATE TABLE migrations(name TEXT PRIMARY KEY,applied_at TEXT NOT NULL)",
  );
  for (const name of [
    "0001_foundation",
    "0002_entity_properties",
    "0003_snapshot_order",
    "0004_source_foundation",
    "0005_current_scene_only",
  ]) {
    legacy.exec(
      readFileSync(
        new URL(`../server/migrations/${name}.sql`, import.meta.url),
        "utf8",
      ),
    );
    legacy
      .prepare("INSERT INTO migrations VALUES (?,?)")
      .run(name, "2026-01-01");
  }
  const { createFixture } = await import("@habitat/domain/fixture"),
    s = createFixture();
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
      .run(s.id, s.projectId, s.revision);
    legacy
      .prepare("INSERT INTO scene_state VALUES (?,?,?,?,?,?)")
      .run(s.id, s.id, s.revision, "2026-01-01", 1, "m");
    for (const [ordinal, e] of s.evidence.entries())
      legacy
        .prepare("INSERT INTO evidence VALUES (?,?,?,?)")
        .run(s.id, e.id, JSON.stringify(e), ordinal);
    for (const f of s.floors) {
      legacy
        .prepare("INSERT INTO floors VALUES (?,?,?,?,?)")
        .run(s.id, f.id, f.name, f.elevation, JSON.stringify(f.scale));
      for (const e of entitiesOf(f)) {
        legacy
          .prepare(
            insertEntitySql
              .replace(",bottom_elevation,top_elevation", "")
              .replace(",@bottomElevation,@topElevation", "")
              .replace(
                ",enclosure_status,floor_elevation,ceiling_elevation,boundary_source",
                "",
              )
              .replace(
                ",@enclosureStatus,@floorElevation,@ceilingElevation,@boundarySource",
                "",
              ),
          )
          .run(entityRecord(s.id, e));
        for (const [ordinal, eid] of e.evidenceIds.entries())
          legacy
            .prepare("INSERT INTO entity_evidence VALUES (?,?,?,?)")
            .run(s.id, e.id, eid, ordinal);
      }
    }
  })();
  await legacy.backup(copyPath);
  legacy.close();
  const db = openDatabase(copyPath);
  cleanup.unshift(() => db.sqlite.close());
  const repo = new Repository(db);
  expect(repo.scene(s.id)).toEqual(s);
  const tables = (
    db.sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as { name: string }[]
  ).map((r) => r.name);
  expect(tables).toContain("space_boundary_edges");
  for (const name of ["scene_versions", "corrections", "verifications"])
    expect(tables).not.toContain(name);
  const sql = (
    db.sqlite
      .prepare("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL")
      .all() as { sql: string }[]
  )
    .map((r) => r.sql)
    .join("\n");
  expect(sql).not.toContain("scene_versions");
  expect(sql).not.toContain("current_version");
  expect(db.sqlite.pragma("foreign_key_check")).toEqual([]);
  const service = new SceneService(repo),
    saved = service.save(s.id, s, 1);
  expect(repo.scene(s.id)).toEqual(saved);
  expect(deriveSpacesFromWalls(saved.floors[0])).toHaveLength(7);
});

it("discovers unclaimed legacy wall regions on save and keeps semantic authority separate", () => {
  const { repo, service, scene } = setup(),
    legacy = rectangle();
  repo.transaction(() => repo.writeScene(legacy));
  const discovered = service.save(scene.id, legacy, 1);
  expect(discovered.floors[0].rooms).toHaveLength(1);
  const r = discovered.floors[0].rooms[0];
  expect(r.floorElevation).toBe(0);
  const renamed = service.correct(scene.id, 2, r.id, {
    name: "Office",
    type: "office",
  });
  expect(renamed.floors[0].rooms[0].semantic.verification).toBe(
    "USER_CORRECTED",
  );
  expect(renamed.floors[0].rooms[0].geometry.verification).toBe("DETECTED");
  expect(repo.scene(scene.id)).toEqual(renamed);
});
