import { describe, it, expect, afterEach } from "vitest";
import { authenticatedAgent } from "./auth-helper";
import { createFixture, uuid } from "@habitat/domain/fixture";
import { sceneSchema } from "@habitat/domain";
import {
  area,
  validateScene,
  projectFloor,
  connectivity,
  simplePolygon,
  calibrate,
} from "@habitat/geometry";
import { createApp } from "../server/src/app";
import { openDatabase } from "../server/src/infrastructure/database/database";

describe("canonical residential geometry", () => {
  it("validates the complete fixture and six explicit room connections", () => {
    const s = createFixture();
    expect(validateScene(s).filter(i => i.severity === "error")).toEqual([]);
    expect(s.floors[0].rooms).toHaveLength(7);
    expect(connectivity(s.floors[0])).toHaveLength(6);
    expect(s.floors[0].rooms.reduce((n, r) => n + area(r.boundary), 0)).toBe(
      134,
    );
  });
  it("projects 2D footprints and 3D wall solids from identical metre geometry without mutation", () => {
    const s = createFixture(),
      before = JSON.stringify(s),
      f = s.floors[0],
      p = projectFloor(f);
    expect(p.rooms.map((r) => r.boundary)).toEqual(
      f.rooms.map((r) => r.boundary),
    );
    for (const solid of p.solids) {
      const wall = f.walls.find((w) => w.id === solid.wallId)!;
      expect(solid.thickness).toBe(wall.thickness);
      expect(solid.bottom + solid.height).toBeLessThanOrEqual(
        wall.height! + 1e-8,
      );
    }
    expect(JSON.stringify(s)).toBe(before);
    const fullVolume = f.walls.reduce(
      (n, w) =>
        n +
        Math.hypot(w.end.x - w.start.x, w.end.y - w.start.y) *
          w.thickness! *
          w.height!,
      0,
    );
    const voidVolume = [...f.doors, ...f.windows].reduce(
      (n, o) =>
        n +
        o.width! *
          o.height! *
          f.walls.find((w) => w.id === o.wallId)!.thickness!,
      0,
    );
    const solidVolume = p.solids.reduce(
      (n, w) =>
        n +
        Math.hypot(w.end.x - w.start.x, w.end.y - w.start.y) *
          w.thickness *
          w.height,
      0,
    );
    expect(solidVolume).toBeCloseTo(fullVolume - voidVolume, 8);
  });
  it("does not fill unknown dimensions with guessed heights", () => {
    const s = createFixture(),
      w = s.floors[0].walls[0];
    w.height = null;
    expect(
      projectFloor(s.floors[0]).solids.some((x) => x.wallId === w.id),
    ).toBe(false);
    expect(w.height).toBeNull();
    expect(validateScene(s).some((x) => x.severity === "warning")).toBe(true);
  });
  it("rejects crossing and degenerate polygons, invalid hosts, wrong floors and duplicate walls", () => {
    expect(
      simplePolygon([
        { x: 0, y: 0 },
        { x: 2, y: 2 },
        { x: 0, y: 2 },
        { x: 2, y: 0 },
      ]),
    ).toBe(false);
    const s = createFixture();
    s.floors[0].doors[0].wallId = uuid(999);
    s.floors[0].rooms[0].floorId = uuid(998);
    s.floors[0].walls.push({ ...s.floors[0].walls[0], id: uuid(997) });
    expect(
      validateScene(s).filter((x) => x.severity === "error").length,
    ).toBeGreaterThanOrEqual(3);
  });
  it("rejects negative dimensions and calibrates explicit source pixels", () => {
    const s = createFixture();
    s.floors[0].walls[0].thickness = -1;
    expect(() => sceneSchema.parse(s)).toThrow();
    expect(
      calibrate({ x: 0, y: 0 }, { x: 420, y: 0 }, 4.2).metersPerPixel,
    ).toBe(0.01);
    expect(() => calibrate({ x: 0, y: 0 }, { x: 0, y: 0 }, 4)).toThrow();
  });
});
describe("database and API", () => {
  const instances: ReturnType<typeof createApp>[] = [];
  afterEach(() => {
    instances.splice(0).forEach((a) => a.close());
  });
  const setup = () => {
    const a = createApp(":memory:", "/tmp/habitat-test-storage");
    instances.push(a);
    return a;
  };
  it("applies migrations and enables foreign keys", () => {
    const db = openDatabase(":memory:");
    expect(db.sqlite.pragma("foreign_keys", { simple: true })).toBe(1);
    expect(
      db.sqlite.prepare("SELECT COUNT(*) AS n FROM migrations").get(),
    ).toEqual({ n: 13 });
    expect(() =>
      db.sqlite
        .prepare("INSERT INTO home_scenes VALUES (?,?,?)")
        .run(uuid(999), uuid(998), 1),
    ).toThrow();
    db.sqlite.close();
  });
  it("replaces current state without retaining historical snapshots", () => {
    const a = setup(),
      s = createFixture();
    expect(a.service.requireScene(s.id)).toEqual(s);
    const changed = a.service.correct(s.id, 1, s.floors[0].walls[0].id, {
      height: 3,
    });
    expect(changed.revision).toBe(2);
    expect(a.service.requireScene(s.id)).toEqual(changed);
    expect(
      a.repo.db.sqlite.prepare("SELECT COUNT(*) AS n FROM scene_state").get(),
    ).toEqual({ n: 1 });
    expect(
      a.repo.db.sqlite
        .prepare("SELECT name FROM sqlite_master WHERE name='scene_versions'")
        .get(),
    ).toBeUndefined();
  });
  it("rejects stale saves, invalid geometry and machine changes to verified truth atomically", () => {
    const a = setup(),
      s = createFixture();
    const changed = structuredClone(s);
    changed.floors[0].walls[0].height = 3;
    expect(() => a.service.save(s.id, changed, 1, "machine")).toThrow(
      /verified/,
    );
    expect(() => a.service.save(s.id, s, 2)).toThrow(/changed/);
    s.floors[0].doors[0].width = 50;
    expect(() => a.service.save(s.id, s, 1)).toThrow();
    expect(a.service.requireScene(s.id)).toEqual(createFixture());
  });
  it("creates projects, validates requests and returns explicit missing-resource errors", async () => {
    const instance = setup();
    const agent = await authenticatedAgent(instance);
    expect((await agent.get("/api/projects")).body).toHaveLength(1);
    expect(
      (await agent.post("/api/projects").send({ name: "" })).status,
    ).toBe(400);
    const p = await agent
      .post("/api/projects")
      .send({ name: "My home" });
    expect(p.status).toBe(201);
    expect(
      (await agent.get(`/api/projects/${p.body.id}/scenes`)).body,
    ).toEqual([]);
    expect((await agent.get(`/api/scenes/${uuid(999)}`)).status).toBe(
      404,
    );
  });
  it("saves corrections and verification evidence through API", async () => {
    const instance = setup(),
      s = createFixture();
    const agent = await authenticatedAgent(instance);
    const r = await agent
      .post(`/api/scenes/${s.id}/corrections`)
      .send({
        expectedRevision: 1,
        entityId: s.floors[0].rooms[0].id,
        patch: { name: "Family room" },
      });
    expect(r.status).toBe(201);
    expect(r.body.revision).toBe(2);
    expect(r.body.evidence.at(-1).type).toBe("MANUAL");
    const v = await agent
      .post(`/api/scenes/${s.id}/verifications`)
      .send({ expectedRevision: 2, entityId: s.floors[0].rooms[0].id });
    expect(v.status).toBe(201);
    expect(v.body.revision).toBe(3);
  });
});
