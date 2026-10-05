import { entitySchema, type Entity } from "@habitat/domain";
const scalarKeys = new Set([
  "id",
  "floorId",
  "kind",
  "name",
  "verification",
  "confidence",
  "evidenceIds",
  "wallId",
  "leftRoomId",
  "rightRoomId",
  "fromRoomId",
  "toRoomId",
  "type",
  "thickness",
  "height",
  "width",
  "base",
  "positionAlongWall",
  "sillHeight",
  "bottomElevation",
  "topElevation",
  "area",
  "enclosureStatus",
  "floorElevation",
  "ceilingElevation",
  "boundarySource",
  "boundaryEdges",
]);
export function entityRecord(stateId: string, e: Entity) {
  return {
    stateId,
    floorId: e.floorId,
    id: e.id,
    kind: e.kind,
    hostWallId: "wallId" in e ? e.wallId : null,
    leftRoomId: "leftRoomId" in e ? e.leftRoomId : null,
    rightRoomId: "rightRoomId" in e ? e.rightRoomId : null,
    fromRoomId: "fromRoomId" in e ? e.fromRoomId : null,
    toRoomId: "toRoomId" in e ? e.toRoomId : null,
    data: JSON.stringify(
      Object.fromEntries(
        Object.entries(e).filter(([key]) => !scalarKeys.has(key)),
      ),
    ),
    name: e.name,
    verification: e.verification,
    confidence: e.confidence,
    entityType: "type" in e ? e.type : null,
    thickness: "thickness" in e ? e.thickness : null,
    height: "height" in e ? e.height : null,
    width: "width" in e ? e.width : null,
    base: "base" in e ? e.base : null,
    positionAlongWall: "positionAlongWall" in e ? e.positionAlongWall : null,
    sillHeight: "sillHeight" in e ? e.sillHeight : null,
    bottomElevation: e.kind === "window" ? (e.bottomElevation ?? null) : null,
    topElevation: e.kind === "window" ? (e.topElevation ?? null) : null,
    area: "area" in e ? e.area : null,
    enclosureStatus: e.kind === "room" ? (e.enclosureStatus ?? null) : null,
    floorElevation: e.kind === "room" ? (e.floorElevation ?? null) : null,
    ceilingElevation: e.kind === "room" ? (e.ceilingElevation ?? null) : null,
    boundarySource: e.kind === "room" ? (e.boundarySource ?? null) : null,
  };
}
export type EntityRecord = ReturnType<typeof entityRecord>;
export function recordEntity(row: EntityRecord, evidenceIds: string[]): Entity {
  const entity: Record<string, unknown> = {
    ...JSON.parse(row.data),
    id: row.id,
    floorId: row.floorId,
    kind: row.kind,
    name: row.name,
    verification: row.verification,
    confidence: row.confidence,
    evidenceIds,
  };
  if (["room", "wall", "door", "window", "opening"].includes(row.kind))
    entity.type = row.entityType;
  if (row.kind === "room") {
    entity.area = row.area;
    if (row.boundarySource !== null) entity.boundarySource = row.boundarySource;
    if (row.enclosureStatus !== null)
      entity.enclosureStatus = row.enclosureStatus;
    if (
      row.enclosureStatus !== null ||
      row.floorElevation !== null ||
      row.ceilingElevation !== null
    ) {
      entity.floorElevation = row.floorElevation;
      entity.ceilingElevation = row.ceilingElevation;
    }
  }
  if (row.kind === "wall")
    Object.assign(entity, {
      thickness: row.thickness,
      height: row.height,
      base: row.base,
      leftRoomId: row.leftRoomId,
      rightRoomId: row.rightRoomId,
    });
  if (row.kind === "column") entity.height = row.height;
  if (["door", "window", "opening"].includes(row.kind))
    Object.assign(entity, {
      wallId: row.hostWallId,
      fromRoomId: row.fromRoomId,
      toRoomId: row.toRoomId,
      width: row.width,
      height: row.height,
      positionAlongWall: row.positionAlongWall,
      sillHeight: row.sillHeight,
    });
  if (
    row.kind === "window" &&
    (entity.verticalReference === "WORLD" ||
      row.bottomElevation != null ||
      row.topElevation != null)
  ) {
    entity.bottomElevation = row.bottomElevation;
    entity.topElevation = row.topElevation;
  }
  return entitySchema.parse(entity);
}
export const selectEntityColumns = `state_id AS stateId,floor_id AS floorId,id,kind,host_wall_id AS hostWallId,left_room_id AS leftRoomId,right_room_id AS rightRoomId,from_room_id AS fromRoomId,to_room_id AS toRoomId,data_json AS data,name,verification,confidence,entity_type AS entityType,thickness,height,width,base,position_along_wall AS positionAlongWall,sill_height AS sillHeight,area,enclosure_status AS enclosureStatus,floor_elevation AS floorElevation,ceiling_elevation AS ceilingElevation,boundary_source AS boundarySource,bottom_elevation AS bottomElevation,top_elevation AS topElevation`;
export const insertEntitySql = `INSERT INTO entities(state_id,floor_id,id,kind,host_wall_id,left_room_id,right_room_id,from_room_id,to_room_id,data_json,name,verification,confidence,entity_type,thickness,height,width,base,position_along_wall,sill_height,area,enclosure_status,floor_elevation,ceiling_elevation,boundary_source,bottom_elevation,top_elevation) VALUES (@stateId,@floorId,@id,@kind,@hostWallId,@leftRoomId,@rightRoomId,@fromRoomId,@toRoomId,@data,@name,@verification,@confidence,@entityType,@thickness,@height,@width,@base,@positionAlongWall,@sillHeight,@area,@enclosureStatus,@floorElevation,@ceilingElevation,@boundarySource,@bottomElevation,@topElevation)`;
