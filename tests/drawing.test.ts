import { describe, it, expect } from "vitest";
import { createFixture, uuid } from "@habitat/domain/fixture";
import type { Wall, Room, Floor, Door } from "@habitat/domain";
import {
  exactEndpoint,
  snapDrawing,
  splitJunctions,
  regionAt,
  area,
  deriveRoomConnections,
  connectivity,
  moveWall,
  wallDependencies,
  validateScene,
  projectFloor,
  openingInterval,
} from "@habitat/geometry";
import {
  draftHistory,
  pushDraft,
  undoDraft,
  redoDraft,
} from "../frontend/src/features/editor/history";
let counter = 10000;
const id = () => uuid(counter++);
function empty() {
  const s = createFixture(),
    f = s.floors[0];
  for (const key of [
    "walls",
    "rooms",
    "doors",
    "windows",
    "openings",
    "dimensions",
    "columns",
    "stairs",
    "shafts",
    "zones",
  ] as const)
    f[key] = [];
  return { s, f };
}
function wall(f: Floor, a: [number, number], b: [number, number]): Wall {
  return {
    id: id(),
    kind: "wall",
    floorId: f.id,
    name: "Wall",
    confidence: null,
    evidenceIds: [],
    verification: "USER_CORRECTED",
    type: "interior",
    start: { x: a[0], y: a[1] },
    end: { x: b[0], y: b[1] },
    height: 3,
    thickness: 0.2,
    base: 0,
    connectedWallIds: [],
    leftRoomId: null,
    rightRoomId: null,
  };
}
function rectangle() {
  const { s, f } = empty();
  f.walls = [
    wall(f, [0, 0], [6, 0]),
    wall(f, [6, 0], [6, 4]),
    wall(f, [6, 4], [0, 4]),
    wall(f, [0, 4], [0, 0]),
  ];
  s.floors[0] = splitJunctions(f, id);
  return { s, f: s.floors[0] };
}
function room(f: Floor, p: { x: number; y: number }): Room {
  const r = regionAt(f, p),
    claim = {
      confidence: null,
      evidenceIds: [],
      verification: "USER_CORRECTED" as const,
    };
  return {
    id: id(),
    floorId: f.id,
    name: "Bedroom",
    kind: "room",
    floorElevation: null,
    ceilingElevation: null,
    type: "bedroom",
    ...claim,
    geometry: { ...claim },
    semantic: { ...claim },
    boundary: r.boundary,
    boundaryWallIds: r.wallIds,
    boundarySource: "walls",
    area: area(r.boundary),
  };
}
function door(f: Floor, w: Wall): Door {
  return {
    id: id(),
    kind: "door",
    floorId: f.id,
    name: "Door",
    type: "hinged",
    direction: "unknown",
    hingedOrientation: {
      hingeEndpoint: "OPENING_END",
      swingSide: "WALL_RIGHT",
    },
    wallId: w.id,
    positionAlongWall: 1,
    width: 0.9,
    height: 2.1,
    sillHeight: 0,
    positionReference: "OPENING_START",
    fromRoomId: null,
    toRoomId: null,
    confidence: null,
    evidenceIds: [],
    verification: "USER_CORRECTED",
  };
}
describe("architectural drawing", () => {
  it("draws connected directed walls and finds a closed room without duplicating physical walls", () => {
    const { s, f } = rectangle();
    expect(f.walls).toHaveLength(4);
    expect(f.walls.every((w) => w.connectedWallIds.length === 2)).toBe(true);
    f.rooms.push(room(f, { x: 2, y: 2 }));
    deriveRoomConnections(f);
    expect(f.rooms[0].area).toBe(24);
    expect(f.walls.every((w) => w.leftRoomId === f.rooms[0].id)).toBe(true);
    expect(validateScene(s).filter((i) => i.severity === "error")).toEqual([]);
  });
  it("rejects open boundaries and reports the loose endpoint gap", () => {
    const { f } = rectangle();
    f.walls[3].end.y = 0.12;
    expect(() => regionAt(f, { x: 2, y: 2 })).toThrow(/12 cm/);
  });
  it("supports exact numeric length, endpoints, grid, perpendicular and intersection snaps", () => {
    const { f } = rectangle();
    const p = exactEndpoint({ x: 0, y: 0 }, { x: 3, y: 4 }, 4.2);
    expect(Math.hypot(p.x, p.y)).toBeCloseTo(4.2, 10);
    expect(snapDrawing({ x: 0.04, y: 0.03 }, f.walls).point).toEqual({
      x: 0,
      y: 0,
    });
    expect(
      snapDrawing({ x: 1.11, y: 2.12 }, [], undefined, 0.25).point,
    ).toEqual({ x: 1, y: 2 });
    expect(snapDrawing({ x: 1, y: 2.04 }, [], { x: 0, y: 2 }).label).toBe(
      "Horizontal",
    );
    expect(snapDrawing({ x: 1.02, y: 3 }, [], { x: 1, y: 0 }).label).toBe(
      "Vertical",
    );
    expect(
      snapDrawing({ x: 2.02, y: 0.02 }, f.walls, { x: 2, y: 2 }).label,
    ).toBe("Perpendicular");
    const cross = [wall(f, [0, 2], [4, 2]), wall(f, [2, 0], [2, 4])];
    expect(snapDrawing({ x: 2.03, y: 2.04 }, cross).label).toBe("Intersection");
  });
  it("splits T and cross junctions with preserved direction, hosted placement, and no union", () => {
    const { f } = rectangle();
    const host = f.walls[0];
    f.doors.push(door(f, host));
    f.walls.push(wall(f, [3, 0], [3, 4]));
    const split = splitJunctions(f, id);
    expect(split.walls).toHaveLength(7);
    expect(split.doors[0].wallId).toBe(host.id);
    expect(split.doors[0].positionAlongWall).toBe(1);
    expect(split.walls.find((w) => w.id === host.id)!.start).toEqual(
      host.start,
    );
    expect(area(regionAt(split, { x: 1, y: 2 }).boundary)).toBe(12);
    split.walls.push(wall(split, [0, 2], [6, 2]));
    const crossed = splitJunctions(split, id);
    expect(area(regionAt(crossed, { x: 1, y: 1 }).boundary)).toBe(6);
    f.walls.push(wall(f, [1.5, 0], [1.5, 4]));
    expect(() => splitJunctions(f, id)).toThrow(/crosses Door/);
  });
  it("derives connectivity through a shared wall door and removes it with the door", () => {
    const { s, f } = rectangle();
    f.walls.push(wall(f, [3, 0], [3, 4]));
    const next = splitJunctions(f, id);
    s.floors[0] = next;
    next.rooms.push(room(next, { x: 1, y: 2 }), room(next, { x: 5, y: 2 }));
    const w = next.walls.find((w) => w.start.x === 3 && w.end.x === 3)!;
    next.doors.push(door(next, w));
    deriveRoomConnections(next);
    expect(connectivity(next)).toHaveLength(1);
    expect(wallDependencies(next, w.id)).toHaveLength(3);
    expect(validateScene(s).filter((i) => i.severity === "error")).toEqual([]);
    next.doors = [];
    expect(connectivity(next)).toHaveLength(0);
  });
  it("moves a whole wall preserving door parameters, enclosure, and shared projection", () => {
    const { s, f } = rectangle();
    const w = f.walls[0];
    f.doors.push(door(f, w));
    f.rooms.push(room(f, { x: 2, y: 2 }));
    deriveRoomConnections(f);
    const moved = moveWall(f, w.id, { x: 0, y: -1 }, { x: 6, y: -1 });
    s.floors[0] = moved;
    expect(moved.doors[0]).toEqual(f.doors[0]);
    expect(moved.rooms[0].area).toBe(30);
    expect(validateScene(s).filter((i) => i.severity === "error")).toEqual([]);
    const p = projectFloor(moved),
      cut = openingInterval(moved.doors[0])!;
    expect(cut.start).toBe(1);
    expect(cut.end).toBe(1.9);
    expect(p.solids.filter((s) => s.wallId === w.id)).toHaveLength(3);
    expect(p.walls[0].start).toEqual(moved.walls[0].start);
  });
  it("rejects floating, oversized, and out-of-floor openings; flags stale dimensions", () => {
    const { s, f } = rectangle();
    const d = door(f, f.walls[0]);
    f.doors.push(d);
    d.width = 10;
    expect(validateScene(s).some((i) => i.message.includes("beyond"))).toBe(
      true,
    );
    d.width = 0.9;
    d.wallId = id();
    expect(validateScene(s).some((i) => i.message.includes("host wall"))).toBe(
      true,
    );
    d.wallId = f.walls[0].id;
    d.floorId = id();
    expect(
      validateScene(s).some((i) => i.message.includes("another floor")),
    ).toBe(true);
    f.dimensions.push({
      id: id(),
      kind: "dimension",
      floorId: f.id,
      name: "Dimension",
      confidence: null,
      evidenceIds: [],
      verification: "USER_CORRECTED",
      start: { x: 0, y: 0 },
      end: { x: 6, y: 0 },
      value: 6,
      startAnchor: { wallId: f.walls[0].id, endpoint: "start" },
    });
    f.walls[0].start.x = -1;
    expect(
      validateScene(s).some((i) => i.message.includes("Dimension reference")),
    ).toBe(true);
  });
  it("uses one draft history, undo/redo and branch replacement without changing revision", () => {
    const { s } = rectangle(),
      next = structuredClone(s);
    next.floors[0].walls[0].height = 4;
    const h = pushDraft(draftHistory(s), next);
    expect(h.present.revision).toBe(s.revision);
    expect(undoDraft(h).present).toEqual(s);
    expect(redoDraft(undoDraft(h)).present).toEqual(next);
    const other = structuredClone(s);
    other.floors[0].walls[0].height = 5;
    expect(pushDraft(undoDraft(h), other).future).toEqual([]);
  });
});
