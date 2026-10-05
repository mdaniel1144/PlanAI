import { projectItemInstanceSchema } from "./catalog";
import { z } from "zod";
import { windowAssemblySchema } from "./window-assembly";
export * from "./window-assembly";
export const id = z.string().uuid();
export const point = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});
export const polygon = z.array(point).min(3);
export const status = z.enum([
  "UNKNOWN",
  "DETECTED",
  "LOW_CONFIDENCE",
  "VERIFIED",
  "USER_CORRECTED",
  "REJECTED",
  "CONFLICTING",
]);
const positive = z.number().finite().positive().nullable();
export const claim = z.object({
  confidence: z.number().min(0).max(1).nullable(),
  verification: status,
  evidenceIds: z.array(id),
});
const base = { id, floorId: id, name: z.string().min(1), ...claim.shape };
export const spaceBoundaryEdgeSchema = z.discriminatedUnion("kind", [
  z
    .object({
      index: z.number().int().nonnegative(),
      kind: z.literal("WALL"),
      wallId: id,
      start: point,
      end: point,
    })
    .strict(),
  z
    .object({
      index: z.number().int().nonnegative(),
      kind: z.literal("OPEN"),
      wallId: z.null(),
      start: point,
      end: point,
    })
    .strict(),
]);
export type SpaceBoundaryEdge = z.infer<typeof spaceBoundaryEdgeSchema>;
export const enclosureStatusSchema = z.enum([
  "CLOSED",
  "OPEN",
  "PARTIALLY_OPEN",
]);
/** Persisted room is a physical Space; functional zones are a separate concept.
 * Wall-derived boundaries retain the existing wall-centreline convention.
 * An empty boundary represents an indeterminate perimeter, never a zero-area polygon.
 */
export const roomSchema = z.object({
  ...base,
  kind: z.literal("room"),
  type: z.enum([
    "living_room",
    "kitchen",
    "dining",
    "bedroom",
    "bathroom",
    "wc",
    "hallway",
    "laundry",
    "storage",
    "office",
    "balcony",
    "terrace",
    "other",
    "unknown",
  ]),
  boundary: z.array(point),
  enclosureStatus: enclosureStatusSchema.optional(),
  boundaryEdges: z.array(spaceBoundaryEdgeSchema).optional(),
  floorElevation: z.number().finite().nullable().default(null),
  ceilingElevation: z.number().finite().nullable().default(null),
  topology: z
    .object({
      source: z.literal("WALL_TOPOLOGY"),
      engine: z.literal("space-topology-v1"),
      wallSignature: z.string(),
    })
    .strict()
    .optional(),
  boundarySource: z.enum(["walls", "manual"]).optional(),
  boundaryWallIds: z.array(id).optional(),
  area: positive,
  semantic: claim,
  geometry: claim,
});
export const wallSchema = z.object({
  ...base,
  kind: z.literal("wall"),
  type: z.enum(["interior", "exterior", "unknown"]),
  start: point,
  end: point,
  thickness: positive,
  height: positive,
  base: z.number().finite().nullable(),
  connectedWallIds: z.array(id),
  leftRoomId: id.nullable(),
  rightRoomId: id.nullable(),
});
export const hingedOrientationSchema = z.object({
  hingeEndpoint: z.enum(["OPENING_START", "OPENING_END"]),
  swingSide: z.enum(["WALL_LEFT", "WALL_RIGHT"]),
});
const openingBase = {
  ...base,
  wallId: id,
  positionAlongWall: z.number().finite().nonnegative().nullable(),
  // Missing means legacy centre placement. New drawing writes OPENING_START.
  positionReference: z.literal("OPENING_START").optional(),
  width: positive,
  height: positive,
  sillHeight: z.number().finite().nonnegative().nullable(),
  fromRoomId: id.nullable(),
  toRoomId: id.nullable(),
};
export const doorSchema = z.object({
  ...openingBase,
  kind: z.literal("door"),
  type: z.enum(["hinged", "sliding", "unknown"]),
  /** @deprecated Preserved verbatim; never infer orientation from this field. */
  direction: z.enum(["left", "right", "unknown"]),
  hingedOrientation: hingedOrientationSchema.nullable().optional(),
});
export const windowSchema = z.object({
  ...openingBase,
  kind: z.literal("window"),
  type: z.enum([
    "fixed",
    "casement",
    "sliding",
    "tilt_turn",
    "awning",
    "unknown",
  ]),
  // Legacy height/sillHeight remain readable. WORLD windows keep both null.
  verticalReference: z.literal("WORLD").optional(),
  bottomElevation: z.number().finite().nullable().optional(),
  topElevation: z.number().finite().nullable().optional(),
  positionAlongWall: z.number().finite().nullable(),
  width: z.number().finite().nullable(),
  assembly: windowAssemblySchema.nullable().optional(),
});
export const openingSchema = z.object({
  ...openingBase,
  kind: z.literal("opening"),
  type: z.enum(["passage", "unknown"]),
});
export const columnSchema = z.object({
  ...base,
  kind: z.literal("column"),
  boundary: polygon,
  height: positive,
});
export const stairSchema = z.object({
  ...base,
  kind: z.literal("stair"),
  boundary: polygon,
  targetFloorId: id.nullable(),
  rise: positive,
  steps: z.number().int().positive().nullable(),
});
export const shaftSchema = z.object({
  ...base,
  kind: z.literal("shaft"),
  boundary: polygon,
});
const dimensionAnchor = z.object({
  wallId: id,
  endpoint: z.enum(["start", "end"]),
});
export const dimensionSchema = z.object({
  ...base,
  kind: z.literal("dimension"),
  startAnchor: dimensionAnchor.optional(),
  endAnchor: dimensionAnchor.optional(),
  start: point,
  end: point,
  value: positive,
});
export const zoneSchema = z.object({
  ...base,
  kind: z.literal("zone"),
  boundary: polygon,
  roomIds: z.array(id),
});
export const entitySchema = z.discriminatedUnion("kind", [
  roomSchema,
  wallSchema,
  doorSchema,
  windowSchema,
  openingSchema,
  columnSchema,
  stairSchema,
  shaftSchema,
  dimensionSchema,
  zoneSchema,
]);
export const evidenceSchema = z
  .object({
    id,
    type: z.enum(["FIXTURE", "MANUAL", "DETECTION", "CALIBRATION"]),
    description: z.string(),
  })
  .strict();
export const scaleSchema = z.object({
  status: z.enum(["UNKNOWN", "DETECTED", "VERIFIED", "CONFLICTING"]),
  metersPerPixel: positive,
  sourceOrigin: point.nullable(),
  worldOrigin: point.nullable(),
  rotation: z.number().finite().nullable(),
  evidenceIds: z.array(id),
});
export const floorSchema = z.object({
  itemInstances: z.array(projectItemInstanceSchema).max(2000).optional(),
  id,
  name: z.string(),
  elevation: z.number().finite().nullable().default(0),
  scale: scaleSchema,
  rooms: z.array(roomSchema),
  walls: z.array(wallSchema),
  doors: z.array(doorSchema),
  windows: z.array(windowSchema),
  openings: z.array(openingSchema),
  columns: z.array(columnSchema),
  stairs: z.array(stairSchema),
  shafts: z.array(shaftSchema),
  dimensions: z.array(dimensionSchema),
  zones: z.array(zoneSchema),
});
export const sceneSchema = z.object({
  schemaVersion: z.literal(1),
  id,
  projectId: id,
  revision: z.number().int().positive(),
  units: z.literal("m"),
  floors: z.array(floorSchema),
  evidence: z.array(evidenceSchema),
});
export const projectSchema = z.object({
  ownerUserId: id.nullable().default(null),
  id,
  name: z.string().min(1).max(120),
  description: z.string().max(2000),
  units: z.literal("m"),
  createdAt: z.string(),
  isDemo: z.boolean(),
});
export const clarificationSchema = z.object({
  id,
  sceneId: id,
  entityId: id.nullable(),
  priority: z.number().int().min(1).max(8),
  question: z.string(),
  answer: z.string().nullable(),
});
export type Point = z.infer<typeof point>;
export type Entity = z.infer<typeof entitySchema>;
export type Room = z.infer<typeof roomSchema>;
export type Wall = z.infer<typeof wallSchema>;
export type Door = z.infer<typeof doorSchema>;
export type Window = z.infer<typeof windowSchema>;
export type Opening = z.infer<typeof openingSchema>;
export type Floor = z.infer<typeof floorSchema>;
export type HomeScene = z.infer<typeof sceneSchema>;
export type Project = z.infer<typeof projectSchema>;
export type Evidence = z.infer<typeof evidenceSchema>;
export type Clarification = z.infer<typeof clarificationSchema>;
export type Column = z.infer<typeof columnSchema>;
export type Stair = z.infer<typeof stairSchema>;
export type Shaft = z.infer<typeof shaftSchema>;
export type Dimension = z.infer<typeof dimensionSchema>;
export type Zone = z.infer<typeof zoneSchema>;
export const entitiesOf = (floor: Floor): Entity[] => [
  ...floor.rooms,
  ...floor.walls,
  ...floor.doors,
  ...floor.windows,
  ...floor.openings,
  ...floor.columns,
  ...floor.stairs,
  ...floor.shafts,
  ...floor.dimensions,
  ...floor.zones,
];
export const isProtected = (entity: Entity) =>
  [
    entity.verification,
    ...(entity.kind === "room"
      ? [entity.semantic.verification, entity.geometry.verification]
      : []),
  ].some((status) => ["VERIFIED", "USER_CORRECTED"].includes(status));

export const spaceGeometryProtected = (room: Room) =>
  ["VERIFIED", "USER_CORRECTED"].includes(room.geometry.verification);
export const clearHeight = (
  room: Pick<Room, "floorElevation" | "ceilingElevation">,
) =>
  room.floorElevation == null || room.ceilingElevation == null
    ? null
    : room.ceilingElevation - room.floorElevation;
export const elevationDifference = (from: Room, to: Room) =>
  from.floorElevation == null || to.floorElevation == null
    ? null
    : to.floorElevation - from.floorElevation;

export { userRoleSchema, userStatusSchema } from "./user";
export type { UserRole, UserStatus } from "./user";

export * from "./catalog";

export * from "./units";
export * from "./product-dimensions";
