import {
  entityRecord,
  recordEntity,
  selectEntityColumns,
  insertEntitySql,
  type EntityRecord,
} from "./entity-records";
import { eq } from "drizzle-orm";
import {
  entitiesOf,
  sceneSchema,
  projectSchema,
  type HomeScene,
  type Project,
  type Room,
} from "@habitat/domain";
import { projects, type Db } from "./database";
export class Repository {
  constructor(readonly db: Db) {}
  listProjects() {
    return this.db.orm
      .select()
      .from(projects)
      .all()
      .map((p) => projectSchema.parse(p));
  }
  project(id: string) {
    const p = this.db.orm
      .select()
      .from(projects)
      .where(eq(projects.id, id))
      .get();
    return p ? projectSchema.parse(p) : null;
  }
  addProject(p: Project) {
    this.db.orm.insert(projects).values(p).run();
    return p;
  }
  sceneIds(projectId: string) {
    return this.db.sqlite
      .prepare("SELECT id FROM home_scenes WHERE project_id=?")
      .all(projectId) as { id: string }[];
  }
  currentRevision(sceneId: string) {
    const row = this.db.sqlite
      .prepare(
        "SELECT current_revision AS revision FROM home_scenes WHERE id=?",
      )
      .get(sceneId) as { revision: number } | undefined;
    return row?.revision;
  }
  scene(sceneId: string): HomeScene | null {
    const row = this.db.sqlite
      .prepare(
        "SELECT v.id,v.revision,s.project_id AS projectId FROM scene_state v JOIN home_scenes s ON s.id=v.scene_id WHERE v.scene_id=? AND v.revision=?",
      )
      .get(sceneId, this.currentRevision(sceneId) ?? 0) as
      { id: string; revision: number; projectId: string } | undefined;
    if (!row) return null;
    const floors = this.db.sqlite
      .prepare(
        "SELECT id,name,elevation,scale_json AS scale FROM floors WHERE state_id=? ORDER BY rowid",
      )
      .all(row.id) as {
      id: string;
      name: string;
      elevation: number | null;
      scale: string;
    }[];
    const evidence = this.db.sqlite
      .prepare(
        "SELECT data_json AS data FROM evidence WHERE state_id=? ORDER BY ordinal",
      )
      .all(row.id) as { data: string }[];
    const scene = sceneSchema.parse({
      schemaVersion: 1,
      id: sceneId,
      projectId: row.projectId,
      revision: row.revision,
      units: "m",
      evidence: evidence.map((e) => JSON.parse(e.data) as unknown),
      floors: floors.map((f) => {
        const rows = this.db.sqlite
          .prepare(
            `SELECT ${selectEntityColumns} FROM entities WHERE state_id=? AND floor_id=? ORDER BY rowid`,
          )
          .all(row.id, f.id) as EntityRecord[];
        const kinds = [
          "room",
          "wall",
          "door",
          "window",
          "opening",
          "column",
          "stair",
          "shaft",
          "dimension",
          "zone",
        ];
        const instances = this.db.sqlite
          .prepare(
            "SELECT id,floor_id AS floorId,space_id AS spaceId,item_id AS itemId,variant_id AS variantId,model_asset_id AS modelAssetId,position_x AS positionX,position_y AS positionY,rotation FROM project_item_instances WHERE state_id=? AND floor_id=? ORDER BY id",
          )
          .all(row.id, f.id);
        return {
          ...f,
          ...(instances.length ? { itemInstances: instances } : {}),
          scale: JSON.parse(f.scale) as unknown,
          ...Object.fromEntries(
            kinds.map((k) => [
              k === "room" ? "rooms" : `${k}s`,
              rows
                .filter((e) => e.kind === k)
                .map((e) =>
                  recordEntity(
                    e,
                    (
                      this.db.sqlite
                        .prepare(
                          "SELECT evidence_id AS id FROM entity_evidence WHERE state_id=? AND entity_id=? ORDER BY ordinal",
                        )
                        .all(row.id, e.id) as { id: string }[]
                    ).map((link) => link.id),
                  ),
                ),
            ]),
          ),
        };
      }),
    });
    for (const f of scene.floors)
      for (const r of f.rooms) {
        const edges = this.db.sqlite
          .prepare(
            "SELECT edge_index AS 'index',edge_kind AS kind,wall_id AS wallId,start_x AS sx,start_y AS sy,end_x AS ex,end_y AS ey FROM space_boundary_edges WHERE state_id=? AND floor_id=? AND space_id=? ORDER BY edge_index",
          )
          .all(row.id, f.id, r.id) as {
          index: number;
          kind: "WALL" | "OPEN";
          wallId: string | null;
          sx: number;
          sy: number;
          ex: number;
          ey: number;
        }[];
        if (edges.length || r.enclosureStatus)
          r.boundaryEdges = edges.map((e) => ({
            index: e.index,
            kind: e.kind,
            wallId: e.wallId,
            start: { x: e.sx, y: e.sy },
            end: { x: e.ex, y: e.ey },
          })) as Room["boundaryEdges"];
      }
    return sceneSchema.parse(scene);
  }
  writeScene(scene: HomeScene) {
    const sql = this.db.sqlite,
      vid = scene.id;
    // Call inside a transaction: every dependent row is replaced atomically.
    for (const table of [
      "project_item_instances",
      "space_boundary_edges",
      "entity_evidence",
      "entities",
      "evidence",
      "floors",
    ]) {
      sql
        .prepare(
          `DELETE FROM ${table} WHERE state_id IN (SELECT id FROM scene_state WHERE scene_id=?)`,
        )
        .run(scene.id);
    }
    sql.prepare("DELETE FROM scene_state WHERE scene_id=?").run(scene.id);
    sql
      .prepare(
        "INSERT INTO scene_state(id,scene_id,revision,updated_at,schema_version,units) VALUES (?,?,?,?,?,?)",
      )
      .run(
        vid,
        scene.id,
        scene.revision,
        new Date().toISOString(),
        scene.schemaVersion,
        scene.units,
      );
    for (const [ordinal, e] of scene.evidence.entries())
      sql
        .prepare("INSERT INTO evidence VALUES (?,?,?,?)")
        .run(vid, e.id, JSON.stringify(e), ordinal);
    for (const f of scene.floors) {
      sql
        .prepare("INSERT INTO floors VALUES (?,?,?,?,?)")
        .run(vid, f.id, f.name, f.elevation, JSON.stringify(f.scale));
      for (const e of entitiesOf(f)) {
        sql.prepare(insertEntitySql).run(entityRecord(vid, e));
        for (const [ordinal, eid] of e.evidenceIds.entries())
          sql
            .prepare("INSERT INTO entity_evidence VALUES (?,?,?,?)")
            .run(vid, e.id, eid, ordinal);
      }
    }
    for (const f of scene.floors)
      for (const r of f.rooms)
        for (const e of r.boundaryEdges ?? [])
          sql
            .prepare(
              "INSERT INTO space_boundary_edges VALUES (?,?,?,?,?,?,?,?,?,?)",
            )
            .run(
              vid,
              f.id,
              r.id,
              e.index,
              e.kind,
              e.wallId,
              e.start.x,
              e.start.y,
              e.end.x,
              e.end.y,
            );
    for (const f of scene.floors)
      for (const instance of f.itemInstances ?? [])
        sql
          .prepare(
            "INSERT INTO project_item_instances VALUES (?,?,?,?,?,?,?,?,?,?)",
          )
          .run(
            instance.id,
            vid,
            f.id,
            instance.spaceId,
            instance.itemId,
            instance.variantId,
            instance.positionX,
            instance.positionY,
            instance.rotation,
            instance.modelAssetId ?? null,
          );
    sql
      .prepare("UPDATE home_scenes SET current_revision=? WHERE id=?")
      .run(scene.revision, scene.id);
  }
  transaction<T>(operation: () => T): T {
    return this.db.sqlite.transaction(operation)();
  }
  get isOpen() {
    return this.db.sqlite.open;
  }
  createScene(scene: HomeScene) {
    this.db.sqlite
      .prepare("INSERT INTO home_scenes VALUES (?,?,?)")
      .run(scene.id, scene.projectId, scene.revision);
  }
  sceneForFloor(floorId: string) {
    const row = this.db.sqlite
      .prepare(
        "SELECT s.id FROM home_scenes s JOIN scene_state v ON v.scene_id=s.id AND v.revision=s.current_revision JOIN floors f ON f.state_id=v.id WHERE f.id=?",
      )
      .get(floorId) as { id: string } | undefined;
    return row?.id;
  }
  clarifications(sceneId: string) {
    return this.db.sqlite
      .prepare(
        "SELECT id,scene_id AS sceneId,entity_id AS entityId,priority,question,answer FROM clarifications WHERE scene_id=? ORDER BY priority",
      )
      .all(sceneId);
  }
  answerClarification(id: string, answer: string) {
    return (
      this.db.sqlite
        .prepare("UPDATE clarifications SET answer=? WHERE id=?")
        .run(answer, id).changes > 0
    );
  }
}
