import { afterEach, it, expect } from "vitest";
import { authenticatedAgent } from "./auth-helper";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { demoProject, uuid } from "@habitat/domain/fixture";
import { sceneSchema, type WindowAssembly } from "@habitat/domain";
import { createApp } from "../server/src/app";
import { openDatabase } from "../server/src/infrastructure/database/database";
import { windowScene } from "./window-fixtures";
const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const fn of cleanup.splice(0)) fn();
});
function setup(path = ":memory:") {
  const app = createApp(path, "/tmp/unused-window-storage", false),
    s = windowScene();
  app.repo.addProject(demoProject);
  app.repo.transaction(() => {
    app.repo.createScene(s);
    app.repo.writeScene(s);
  });
  cleanup.unshift(app.close);
  return { ...app, scene: s };
}
it("round-trips an advanced three-panel assembly, dimensions, glazing overrides and stable IDs after reopening", () => {
  const root = mkdtempSync(join(tmpdir(), "window-roundtrip-"));
  cleanup.push(() => rmSync(root, { recursive: true, force: true }));
  const path = join(root, "current.sqlite"),
    app = setup(path),
    s = app.scene;
  const saved = app.service.save(s.id, s, 1);
  expect(app.repo.scene(s.id)).toEqual(saved);
  const row = app.repo.db.sqlite
    .prepare(
      "SELECT bottom_elevation AS bottom,top_elevation AS top,data_json AS data FROM entities WHERE kind='window'",
    )
    .get() as { bottom: number; top: number; data: string };
  expect(row.bottom).toBe(0.9);
  expect(row.top).toBe(2.4);
  expect(JSON.parse(row.data).assembly).toEqual(
    s.floors[0].windows[0].assembly,
  );
  expect(JSON.parse(row.data)).not.toHaveProperty("bottomElevation");
  const reopened = createApp(path, "/tmp/unused-window-storage", false);
  cleanup.unshift(reopened.close);
  expect(reopened.repo.scene(s.id)).toEqual(saved);
  const changed = structuredClone(saved);
  changed.floors[0].windows[0].width = 2.6;
  const final = reopened.service.save(s.id, changed, 2);
  expect(final.floors[0].windows[0].assembly!.panels!.map((p) => p.id)).toEqual(
    saved.floors[0].windows[0].assembly!.panels!.map((p) => p.id),
  );
  expect(app.repo.scene(s.id)).toEqual(final);
  expect(
    app.repo.db.sqlite
      .prepare("SELECT count(*) n FROM entities WHERE kind='window'")
      .get(),
  ).toEqual({ n: 1 });
  expect(
    app.repo.db.sqlite.prepare("SELECT count(*) n FROM scene_state").get(),
  ).toEqual({ n: 1 });
  const names = app.repo.db.sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type='table'")
    .all() as { name: string }[];
  expect(names.map((r) => r.name).join(" ")).not.toMatch(/history|versions/);
  expect(app.repo.db.sqlite.pragma("foreign_key_check")).toEqual([]);
  expect(() =>
    app.repo.db.sqlite
      .prepare("UPDATE entities SET bottom_elevation=4 WHERE kind='window'")
      .run(),
  ).toThrow();
});
it.each(["NONE", "FIXED", "SLIDING", "ROLLING", "PLEATED", "UNKNOWN"] as const)(
  "persists screen %s as an architectural requirement",
  (type) => {
    const a = setup();
    a.scene.floors[0].windows[0].assembly!.screen.type = type;
    const saved = a.service.save(a.scene.id, a.scene, 1);
    expect(a.repo.scene(a.scene.id)).toEqual(saved);
  },
);
it.each([
  ["NONE", "UNKNOWN", "NONE"],
  ["ROLLER", "MANUAL", "EXPOSED"],
  ["ROLLER", "ELECTRIC", "CONCEALED"],
  ["LOUVER", "MANUAL", "NONE"],
  ["EXTERNAL_VENETIAN", "ELECTRIC", "INTEGRATED"],
  ["UNKNOWN", "UNKNOWN", "UNKNOWN"],
] as const)("persists shutter %s / %s / %s", (type, operation, boxType) => {
  const a = setup();
  const shutter: WindowAssembly["shutter"] = { type, operation, boxType };
  a.scene.floors[0].windows[0].assembly!.shutter = shutter;
  const saved = a.service.save(a.scene.id, a.scene, 1);
  expect(a.repo.scene(a.scene.id)).toEqual(saved);
});
it("rejects invalid scenes atomically with structured window issues and blocks stale writers", async () => {
  const a = setup(),
    s = a.scene,
    initial = a.repo.scene(s.id);
  const agent = await authenticatedAgent(a);
  const send = (
    scene: unknown,
    capabilities = ["door-orientation-v1", "window-assembly-v1"],
  ) =>
    agent
      .put(`/api/scenes/${s.id}`)
      .send({ scene, expectedRevision: 1, writerCapabilities: capabilities });
  const invalid = structuredClone(s);
  invalid.floors[0].windows[0].topElevation = 5;
  const response = await send(invalid);
  expect(response.status).toBe(422);
  expect(response.body.issues[0].code).toBe("WINDOW_EXCEEDS_WALL_HEIGHT");
  expect(a.repo.scene(s.id)).toEqual(initial);
  invalid.floors[0].windows[0].topElevation = 2.4;
  invalid.floors[0].windows[0].assembly!.panels![1].region.x = 0;
  expect(
    (await send(invalid)).body.issues.map((i: { code: string }) => i.code),
  ).toContain("WINDOW_INVALID_PANEL_LAYOUT");
  expect((await send(s, ["door-orientation-v1"])).status).toBe(409);
  const foreign = structuredClone(s);
  foreign.floors[0].windows[0].wallId = uuid(99999);
  expect((await send(foreign)).body.issues[0].code).toBe(
    "WINDOW_MISSING_HOST_WALL",
  );
  const badScreen = structuredClone(s);
  Object.assign(badScreen.floors[0].windows[0].assembly!.screen, {
    type: "SKU",
  });
  expect((await send(badScreen)).body.issues[0].code).toBe(
    "WINDOW_INVALID_SCREEN",
  );
  const noHost = structuredClone(s);
  noHost.floors[0].walls = [];
  expect((await send(noHost)).status).toBe(422);
  expect(a.repo.scene(s.id)).toEqual(initial);
  const valid = await send(s);
  expect(valid.status).toBe(200);
  expect(sceneSchema.parse(valid.body)).toEqual(a.repo.scene(s.id));
});
it("migrates a populated pre-window database copy without changing legacy geometry or creating assembly claims", async () => {
  const root = mkdtempSync(join(tmpdir(), "window-migration-"));
  cleanup.push(() => rmSync(root, { recursive: true, force: true }));
  const path = join(root, "old.sqlite"),
    copy = join(root, "copy.sqlite");
  // Seed current schema with legacy data, then remove only the new empty columns and migration marker.
  const app = createApp(path, join(root, "storage"));
  const before = app.repo
    .sceneIds(demoProject.id)
    .map(({ id }) => app.repo.scene(id));
  app.repo.db.sqlite.exec(
    "DROP TRIGGER window_elevation_update; ALTER TABLE entities DROP COLUMN top_elevation; ALTER TABLE entities DROP COLUMN bottom_elevation; DELETE FROM migrations WHERE name='0008_window_assemblies'",
  );
  await app.repo.db.sqlite.backup(copy);
  app.close();
  const db = openDatabase(copy);
  cleanup.unshift(() => db.sqlite.close());
  const { Repository } =
    await import("../server/src/infrastructure/database/repository");
  const repo = new Repository(db);
  expect(repo.sceneIds(demoProject.id).map(({ id }) => repo.scene(id))).toEqual(
    before,
  );
  expect(db.sqlite.pragma("foreign_key_check")).toEqual([]);
  const original = new Database(path);
  expect(
    original
      .prepare(
        "SELECT count(*) n FROM migrations WHERE name='0008_window_assemblies'",
      )
      .get(),
  ).toEqual({ n: 0 });
  original.close();
});
