import { describe, it, expect, afterEach } from "vitest";
import { authenticatedAgent } from "./auth-helper";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/src/app";
import { createFixture, uuid } from "@habitat/domain/fixture";
import { entitiesOf } from "@habitat/domain";
import { validateScene, connectivity, projectFloor } from "@habitat/geometry";
const roots: string[] = [];
const instances: ReturnType<typeof createApp>[] = [];
const setup = () => {
  const root = mkdtempSync(join(tmpdir(), "habitat-integration-"));
  roots.push(root);
  const instance = createApp(join(root, "test.sqlite"), join(root, "storage"));
  instances.push(instance);
  return { ...instance, root };
};
afterEach(() => {
  for (const instance of instances.splice(0))
    if (instance.repo.db.sqlite.open) instance.close();
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
describe("persistence and architectural authority", () => {
  it("reopens a migrated database without re-seeding or losing changes", () => {
    const a = setup(),
      s = createFixture();
    a.service.correct(s.id, 1, s.floors[0].walls[0].id, { height: 3.2 });
    a.close();
    const b = createApp(join(a.root, "test.sqlite"), join(a.root, "storage"));
    instances.push(b);
    expect(b.service.requireScene(s.id).revision).toBe(2);
    expect(b.service.requireScene(s.id).floors[0].walls[0].height).toBe(3.2);
    expect(
      b.repo.db.sqlite.prepare("SELECT COUNT(*) AS n FROM migrations").get(),
    ).toEqual({ n: 13 });
  });
  it("keeps room semantics separate from boundary verification", () => {
    const { service } = setup(),
      s = createFixture();
    const first = service.requireScene(s.id);
    first.floors[0].rooms[0].geometry.verification = "LOW_CONFIDENCE";
    service.save(s.id, first, 1);
    const updated = service.correct(s.id, 2, first.floors[0].rooms[0].id, {
      name: "Family room",
    });
    expect(updated.floors[0].rooms[0].semantic.verification).toBe(
      "USER_CORRECTED",
    );
    expect(updated.floors[0].rooms[0].geometry.verification).toBe(
      "LOW_CONFIDENCE",
    );
  });
  it("protects evidence and verified scale against later machine predictions", () => {
    const { service } = setup(),
      s = createFixture();
    s.evidence[0].description = "Rewritten machine claim";
    expect(() => service.save(s.id, s, 1, "machine")).toThrow(/evidence/);
    const next = createFixture();
    next.floors[0].scale.status = "UNKNOWN";
    expect(() => service.save(next.id, next, 1, "machine")).toThrow(/scale/);
  });
  it("rejects missing claim evidence, broken wall connections and nonadjacent doors", () => {
    const s = createFixture(),
      f = s.floors[0];
    f.rooms[0].semantic.evidenceIds = [uuid(998)];
    f.walls[0].connectedWallIds.push(f.walls.at(-1)!.id);
    f.doors[0].toRoomId = f.rooms[6].id;
    expect(
      validateScene(s).filter((i) => i.severity === "error").length,
    ).toBeGreaterThanOrEqual(3);
    expect(connectivity(f)).toHaveLength(5);
  });
  it("supports a second floor without duplicating IDs or cross-floor hosts", () => {
    const s = createFixture();
    const floor = structuredClone(s.floors[0]);
    const oldId = floor.id;
    floor.id = uuid(900);
    floor.name = "First floor";
    floor.elevation = 3.4;
    const mapping = new Map(
      entitiesOf(floor).map((e, i) => [e.id, uuid(1000 + i)]),
    );
    for (const entity of entitiesOf(floor)) {
      entity.floorId = floor.id;
      entity.id = mapping.get(entity.id)!;
      if (entity.kind === "wall") {
        entity.connectedWallIds = entity.connectedWallIds.map((id) =>
          mapping.get(id)!,
        );
        entity.leftRoomId = entity.leftRoomId
          ? mapping.get(entity.leftRoomId)!
          : null;
        entity.rightRoomId = entity.rightRoomId
          ? mapping.get(entity.rightRoomId)!
          : null;
      }
      if ("wallId" in entity) {
        entity.wallId = mapping.get(entity.wallId)!;
        entity.fromRoomId = entity.fromRoomId
          ? mapping.get(entity.fromRoomId)!
          : null;
        entity.toRoomId = entity.toRoomId
          ? mapping.get(entity.toRoomId)!
          : null;
      }
    }
    s.floors.push(floor);
    expect(floor.id).not.toBe(oldId);
    expect(validateScene(s).filter(i => i.severity === "error")).toEqual([]);
    expect(projectFloor(floor).solids[0].bottom).toBe(3.4);
    const { service } = setup();
    expect(service.save(s.id, s, 1).floors).toHaveLength(2);
    s.floors[1].doors[0].wallId = s.floors[0].walls[0].id;
    expect(validateScene(s).some((i) => i.message.includes("host"))).toBe(true);
  });
  it("enforces composite host foreign keys even below the service layer", () => {
    const { repo } = setup();
    expect(() =>
      repo.db.sqlite
        .prepare("UPDATE entities SET host_wall_id=? WHERE kind=?")
        .run(uuid(998), "door"),
    ).toThrow(/FOREIGN KEY/);
  });
});

describe("removed upload and history endpoints", () => {
  it("rejects old routes and keeps only the current scene when saving", async () => {
    const instance = setup(), {repo} = instance,
      s = createFixture();
    const agent = await authenticatedAgent(instance);
    for (const path of [
      `/api/projects/${s.projectId}/artifacts`,
      `/api/projects/${s.projectId}/documents`,
      `/api/projects/${s.projectId}/normalizations`,
      `/api/projects/${s.projectId}/analysis-runs`,
      `/api/scenes/${s.id}/versions`,
      `/api/scenes/${s.id}/restore`,
      `/api/scenes/${s.id}/source-pages`,
      `/api/scenes/${s.id}/geometry`,
    ]) {
      await agent.get(path).expect(404);
      await agent.post(path).send({}).expect(404);
    }
    await agent.get(`/api/scenes/${s.id}?version=1`).expect(400);
    s.floors[0].rooms[0].name = "Saved current room";
    await agent
      .put(`/api/scenes/${s.id}`)
      .send({
        scene: s,
        expectedRevision: 1,
        writerCapabilities: ["door-orientation-v1"],
      })
      .expect(200);
    expect(repo.scene(s.id)?.floors[0].rooms[0].name).toBe(
      "Saved current room",
    );
    expect(
      repo.db.sqlite.prepare("SELECT COUNT(*) AS n FROM scene_state").get(),
    ).toEqual({ n: 1 });
    await agent
      .put(`/api/scenes/${s.id}`)
      .send({ scene: s, expectedRevision: 1 })
      .expect(409);
  });
});
