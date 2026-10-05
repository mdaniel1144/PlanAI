import { CatalogService } from "../items/service";
import { randomUUID } from "node:crypto";
import {
  entitiesOf,
  floorSchema,
  isProtected,
  type Entity,
  type Door,
  type HomeScene,
  type Project,
} from "@habitat/domain";
import { createFixture, demoProject } from "@habitat/domain/fixture";
import { assertScene, validateScene } from "@habitat/geometry";
import { Repository } from "../../infrastructure/database/repository";
import { HttpError } from "../../errors";
import { SpaceTopologyService } from "./space-topology";
import { WindowService } from "./windows";
export class SceneService {
  readonly windows = new WindowService();
  readonly spaces = new SpaceTopologyService();
  constructor(readonly repo: Repository) {}
  requireProject(id: string) {
    const p = this.repo.project(id);
    if (!p) throw new HttpError(404, "Project not found");
    return p;
  }
  requireScene(id: string) {
    const scene = this.repo.scene(id);
    if (!scene) throw new HttpError(404, "Scene not found");
    return scene;
  }
  seed() {
    if (!this.repo.project(demoProject.id))
      this.repo.transaction(() => {
        this.repo.addProject(demoProject);
        const scene = assertScene(createFixture());
        this.repo.createScene(scene);
        this.repo.writeScene(scene);
      });
  }
  createProject(
    input: Pick<Project, "name" | "description" | "units">,
    ownerUserId: string | null = null,
  ) {
    return this.repo.addProject({
      ...input,
      ownerUserId,
      id: randomUUID(),
      isDemo: false,
      createdAt: new Date().toISOString(),
    });
  }
  save(
    sceneId: string,
    input: HomeScene,
    expected: number,
    actor: "user" | "machine" = "user",
    confirmedRoomId?: string,
  ) {
    return this.repo.transaction(() => {
      const previous = this.requireScene(sceneId);
      if (previous.revision !== expected)
        throw new HttpError(
          409,
          "The scene has changed. Reload before saving.",
        );
      if (input.id !== previous.id || input.projectId !== previous.projectId)
        throw new HttpError(400, "Scene identity cannot change");
      let scene = structuredClone(input);
      scene.revision = expected + 1;
      if (actor === "machine") {
        const after = new Map(
          scene.floors.flatMap(entitiesOf).map((e) => [e.id, e]),
        );
        for (const before of previous.floors.flatMap(entitiesOf))
          if (
            isProtected(before) &&
            JSON.stringify(before) !== JSON.stringify(after.get(before.id))
          )
            throw new HttpError(
              409,
              "Machine predictions cannot overwrite verified architecture",
            );
      }
      if (actor === "machine") {
        for (const evidence of previous.evidence) {
          if (
            JSON.stringify(evidence) !==
            JSON.stringify(scene.evidence.find((e) => e.id === evidence.id))
          )
            throw new HttpError(
              409,
              "Machine predictions cannot rewrite existing evidence",
            );
        }
        for (const floor of previous.floors) {
          if (
            floor.elevation !== null &&
            floor.elevation !==
              scene.floors.find((f) => f.id === floor.id)?.elevation
          )
            throw new HttpError(
              409,
              "Machine predictions cannot overwrite known floor elevation",
            );
          if (
            floor.scale.status === "VERIFIED" &&
            JSON.stringify(floor.scale) !==
              JSON.stringify(scene.floors.find((f) => f.id === floor.id)?.scale)
          )
            throw new HttpError(
              409,
              "Machine predictions cannot overwrite verified scale",
            );
        }
      }
      for (const evidence of previous.evidence) {
        const retained = scene.evidence.find((e) => e.id === evidence.id);
        if (retained && JSON.stringify(evidence) !== JSON.stringify(retained))
          throw new HttpError(
            409,
            "Existing evidence is immutable; append a new claim",
          );
      }
      this.windows.validate(scene);
      scene = this.spaces.derive(scene, previous);
      if (confirmedRoomId) {
        const room = scene.floors
          .flatMap((f) => f.rooms)
          .find((r) => r.id === confirmedRoomId);
        const confirmation = input.floors
          .flatMap((f) => f.rooms)
          .find((r) => r.id === confirmedRoomId);
        if (room && confirmation) room.geometry = confirmation.geometry;
      }
      try {
        assertScene(scene);
      } catch (e) {
        throw new HttpError(
          422,
          e instanceof Error ? e.message : "Invalid scene",
        );
      }
      new CatalogService(this.repo.db.sqlite).validateInstances(
        scene,
        previous,
      );
      this.repo.writeScene(scene);
      return scene;
    });
  }
  correct(
    sceneId: string,
    expected: number,
    entityId: string,
    patch: Partial<Pick<Entity, "name">> & {
      type?: import("@habitat/domain").Room["type"];
      floorElevation?: number | null;
      ceilingElevation?: number | null;
      height?: number | null;
      thickness?: number | null;
      width?: number | null;
      hingedOrientation?: Door["hingedOrientation"];
    },
    verify = false,
  ) {
    return this.repo.transaction(() => {
      const scene = this.requireScene(sceneId);
      const entity = scene.floors
        .flatMap(entitiesOf)
        .find((e) => e.id === entityId);
      if (!entity) throw new HttpError(404, "Entity not found");
      for (const key of Object.keys(patch))
        if (
          !(key in entity) &&
          !(key === "hingedOrientation" && entity.kind === "door") &&
          !(
            ["floorElevation", "ceilingElevation"].includes(key) &&
            entity.kind === "room"
          )
        )
          throw new HttpError(
            400,
            `Property ${key} does not belong to this entity`,
          );
      Object.assign(entity, patch);
      entity.verification = verify ? "VERIFIED" : "USER_CORRECTED";
      const eid = randomUUID();
      scene.evidence.push({
        id: eid,

        type: "MANUAL",
        description: verify ? "Confirmed by user" : "Edited by user",
      });
      entity.evidenceIds.push(eid);
      if (entity.kind === "room") {
        entity.semantic.verification = entity.verification;
        entity.semantic.evidenceIds.push(eid);
        // A label correction does not confirm or change the room boundary.
        if (verify) {
          entity.geometry.verification = "VERIFIED";
          entity.geometry.evidenceIds.push(eid);
        }
      }
      return this.save(
        sceneId,
        scene,
        expected,
        "user",
        verify && entity.kind === "room" ? entity.id : undefined,
      );
    });
  }
  createScene(projectId: string, floorName: string, elevation: number | null) {
    this.requireProject(projectId);
    return this.repo.transaction(() => {
      if (this.repo.sceneIds(projectId).length)
        throw new HttpError(409, "This project already has a scene");
      const floor = floorSchema.parse({
        id: randomUUID(),
        name: floorName,
        elevation,
        scale: {
          status: "UNKNOWN",
          metersPerPixel: null,
          sourceOrigin: null,
          worldOrigin: null,
          rotation: null,
          evidenceIds: [],
        },
        rooms: [],
        walls: [],
        doors: [],
        windows: [],
        openings: [],
        columns: [],
        stairs: [],
        shafts: [],
        dimensions: [],
        zones: [],
      });
      const scene: HomeScene = {
        id: randomUUID(),
        projectId,
        revision: 1,
        schemaVersion: 1,
        units: "m",
        floors: [floor],
        evidence: [],
      };
      this.repo.createScene(scene);
      this.repo.writeScene(scene);
      return scene;
    });
  }
  issues(sceneId: string) {
    return validateScene(this.requireScene(sceneId));
  }
}
