import { describe, it, expect } from "vitest";
import { clearHeight, elevationDifference, roomSchema } from "@habitat/domain";
import { uuid } from "@habitat/domain/fixture";
import {
  deriveSpacesFromWalls,
  reconcileSpaces,
  polygonOverlap,
  validateScene,
  projectFloor,
  interiorLabelPoint,
  pointInPolygon,
  recomputeSceneSpaces,
  moveWall,
} from "@habitat/geometry";
import { SpaceTopologyService } from "../server/src/modules/scenes/space-topology";
import { spaceFixtures, rectangle, detected, wall } from "./space-fixtures";

describe("physical Space topology", () => {
  it("starts newly discovered spaces at zero elevation", () => {
    const scene = detected(rectangle());
    expect(scene.floors[0].rooms).toHaveLength(1);
    expect(scene.floors[0].rooms[0].floorElevation).toBe(0);
  });
  it.each([
    ["closed", "CLOSED", 32],
    ["open", "OPEN", 32],
    ["partiallyOpen", "PARTIALLY_OPEN", 32],
    ["smallGap", "PARTIALLY_OPEN", 32],
    ["lShape", "CLOSED", 20],
  ] as const)(
    "%s classification and area without invented walls",
    (name, status, area) => {
      const scene = spaceFixtures[name](),
        floor = scene.floors[0],
        before = JSON.stringify(floor.walls),
        c = deriveSpacesFromWalls(floor);
      expect(c).toHaveLength(1);
      expect(c[0].enclosureStatus).toBe(status);
      expect(c[0].area).toBe(area);
      expect(JSON.stringify(floor.walls)).toBe(before);
      for (const e of c[0].boundaryEdges)
        expect(
          e.kind === "OPEN"
            ? e.wallId === null
            : floor.walls.some((w) => w.id === e.wallId),
        ).toBe(true);
      expect(
        validateScene(detected(scene)).filter((i) => i.severity === "error"),
      ).toEqual([]);
    },
  );
  it("nodes shared boundaries without splitting/duplicating canonical walls", () => {
    const s = spaceFixtures.shared(),
      f = s.floors[0],
      c = deriveSpacesFromWalls(f);
    expect(c).toHaveLength(2);
    expect(c.map((r) => r.area)).toEqual([16, 16]);
    expect(f.walls).toHaveLength(5);
    expect(c.every((r) => r.boundaryWallIds?.includes(uuid(1010)))).toBe(true);
    expect(
      deriveSpacesFromWalls({ ...f, walls: f.walls.toReversed() }),
    ).toEqual(c);
  });
  it("keeps a small wall gap explicitly open", () => {
    const c = deriveSpacesFromWalls(spaceFixtures.smallGap().floors[0])[0],
      e = c.boundaryEdges.find((e) => e.kind === "OPEN")!;
    expect(Math.abs(e.end.x - e.start.x)).toBeCloseTo(0.001, 10);
  });
  it("preserves stable identity and semantics through movement, split and merge", () => {
    const s = detected(rectangle()),
      f = s.floors[0],
      room = f.rooms[0];
    room.name = "Living";
    room.type = "living_room";
    room.floorElevation = -0.02;
    room.ceilingElevation = 3;
    const changed = moveWall(
      f,
      f.walls[1].id,
      { x: 8.1, y: 0 },
      { x: 8.1, y: 4 },
    );
    const moved = reconcileSpaces(changed, f);
    expect(moved.issues).toEqual([]);
    expect(moved.floor.rooms[0]).toMatchObject({
      id: room.id,
      name: "Living",
      type: "living_room",
      floorElevation: -0.02,
      area: 32.4,
    });
    const split = structuredClone(f);
    split.walls.push(wall(split, { x: 4, y: 0 }, { x: 4, y: 4 }, 10));
    const two = reconcileSpaces(split, f).floor;
    expect(two.rooms).toHaveLength(2);
    expect(two.rooms[0].id).toBe(room.id);
    expect(two.rooms[1].type).toBe("unknown");
    expect(reconcileSpaces(split, f).floor).toEqual(two);
    const merged = reconcileSpaces(
      { ...two, walls: two.walls.filter((w) => w.id !== uuid(1010)) },
      two,
    ).floor;
    expect(merged.rooms).toHaveLength(1);
    expect(merged.rooms[0].id).toBe(
      [...two.rooms].sort((a, b) => (a.id < b.id ? -1 : 1))[0].id,
    );
  });
  it.each(["VERIFIED", "USER_CORRECTED"] as const)(
    "protects %s geometry against automatic replacement",
    (verification) => {
      const s = detected(rectangle()),
        f = s.floors[0];
      f.rooms[0].geometry.verification = verification;
      const next = structuredClone(f);
      next.walls.push(wall(next, { x: 4, y: 0 }, { x: 4, y: 4 }, 10));
      const result = reconcileSpaces(next, f);
      expect(
        result.issues.some((i) => i.code === "SPACE_GEOMETRY_CONFLICT"),
      ).toBe(true);
      expect(
        result.floor.rooms.find((r) => r.id === f.rooms[0].id)?.boundary,
      ).toEqual(f.rooms[0].boundary);
    },
  );
  it("isolates floors and detects duplicate/overlapping regions", () => {
    const s = detected(rectangle()),
      f = s.floors[0];
    f.rooms.push({ ...structuredClone(f.rooms[0]), id: uuid(2000) });
    expect(
      validateScene(s).some(
        (i) => "code" in i && i.code === "SPACE_DUPLICATE_REGION",
      ),
    ).toBe(true);
    f.rooms[1].boundary = f.rooms[1].boundary.map((p) => ({
      x: p.x + 1,
      y: p.y,
    }));
    expect(
      validateScene(s).some((i) => "code" in i && i.code === "SPACE_OVERLAP"),
    ).toBe(true);
    const foreign = {
      ...f,
      id: uuid(3333),
      rooms: [],
      walls: f.walls.map((w) => ({ ...w, floorId: uuid(3333) })),
    };
    expect(reconcileSpaces(foreign).floor.rooms[0].id).not.toBe(f.rooms[0].id);
  });
  it("computes concave overlap and places L-shaped labels inside", () => {
    const c = deriveSpacesFromWalls(spaceFixtures.lShape().floors[0])[0];
    expect(polygonOverlap(c.boundary, c.boundary)).toBeCloseTo(20);
    expect(pointInPolygon(interiorLabelPoint(c.boundary), c.boundary)).toBe(
      true,
    );
  });
  it("keeps negative and unknown elevations; derives height and difference", () => {
    const s = spaceFixtures.levels(),
      [a, b] = s.floors[0].rooms;
    expect(elevationDifference(a, b)).toBe(0.45);
    expect(clearHeight(b)).toBe(2.75);
    expect(clearHeight({ ...b, ceilingElevation: null })).toBeNull();
    expect(
      roomSchema.parse(spaceFixtures.bathroom().floors[0].rooms[0])
        .floorElevation,
    ).toBe(-0.02);
    b.ceilingElevation = 0.45;
    expect(
      validateScene(s).some(
        (i) => "code" in i && i.code === "SPACE_INVALID_CEILING",
      ),
    ).toBe(true);
    b.ceilingElevation = 0.44;
    expect(
      validateScene(s).some(
        (i) => "code" in i && i.code === "SPACE_INVALID_CEILING",
      ),
    ).toBe(true);
    expect(() =>
      roomSchema.parse({ ...b, floorElevation: Infinity }),
    ).toThrow();
  });
  it("server and local draft use the same topology; both viewers share canonical elevations", () => {
    const previous = rectangle();
    previous.floors[0].walls = [];
    const proposed = spaceFixtures.levels(),
      local = recomputeSceneSpaces(proposed, previous).scene;
    expect(new SpaceTopologyService().derive(proposed, previous)).toEqual(
      local,
    );
    const view = projectFloor(local.floors[0]);
    expect(view.rooms.map((r) => [r.id, r.floorElevation])).toEqual(
      local.floors[0].rooms.map((r) => [r.id, r.floorElevation]),
    );
  });
  it("clears user elevations to unknown without restoring old values", () => {
    const before = spaceFixtures.levels(),
      after = structuredClone(before);
    after.floors[0].rooms[0].floorElevation = null;
    expect(
      recomputeSceneSpaces(after, before).scene.floors[0].rooms[0]
        .floorElevation,
    ).toBeNull();
  });
});

it("keeps explicit manual polygons independent of automatic Space reconciliation", () => {
  const s = detected(rectangle()),
    f = s.floors[0],
    manual = {
      ...structuredClone(f.rooms[0]),
      id: uuid(7000),
      name: "Authored",
      boundary: [
        { x: 10, y: 0 },
        { x: 12, y: 0 },
        { x: 12, y: 2 },
      ],
      boundarySource: "manual" as const,
      area: 2,
      geometry: {
        confidence: null,
        verification: "USER_CORRECTED" as const,
        evidenceIds: [],
      },
    };
  delete manual.topology;
  delete manual.enclosureStatus;
  delete manual.boundaryEdges;
  delete manual.boundaryWallIds;
  f.rooms.push(manual);
  const next = structuredClone(f);
  next.rooms.push({
    ...structuredClone(manual),
    id: uuid(7001),
    boundary: manual.boundary.map((p) => ({ x: p.x, y: p.y + 4 })),
  });
  const result = reconcileSpaces(next, f);
  expect(result.issues).toEqual([]);
  expect(result.floor.rooms).toHaveLength(3);
  const removed = {
    ...result.floor,
    rooms: result.floor.rooms.filter((r) => r.id !== manual.id),
  };
  expect(reconcileSpaces(removed, result.floor).floor.rooms).toHaveLength(2);
});
