import { describe, expect, it } from "vitest";
import {
  windowPlacementAt,
  windowSillReference,
  windowWorldElevationFromSill,
  windowTopFromHeight,
  windowSillFromWorldElevation,
  windowHeightFromWorldElevations,
  openingElevations,
  validateScene,
  recomputeSceneSpaces,
  deriveRoomConnections,
} from "@habitat/geometry";
import { detected, rectangle, spaceFixtures } from "./space-fixtures";
import { windowScene } from "./window-fixtures";

describe("window sill references and conversion", () => {
  it.each([
    [0, 0.9, 1.5, 0.9, 2.4],
    [0.45, 0.9, 1.5, 1.35, 2.85],
    [3, 0.9, 1.2, 3.9, 5.1],
  ])(
    "converts reference %s with sill %s and height %s to canonical world geometry",
    (reference, sill, height, bottom, top) => {
      const actualBottom = windowWorldElevationFromSill(reference, sill);
      const actualTop = windowTopFromHeight(actualBottom, height);
      expect(actualBottom).toBeCloseTo(bottom);
      expect(actualTop).toBeCloseTo(top);
      expect(windowSillFromWorldElevation(actualBottom, reference)).toBeCloseTo(
        sill,
      );
      expect(
        windowHeightFromWorldElevations(actualBottom, actualTop),
      ).toBeCloseTo(height);
    },
  );
  it("prefers the known adjacent space to the active floor, including negative levels", () => {
    const f = detected(rectangle()).floors[0];
    f.elevation = 3;
    f.rooms[0].floorElevation = -0.02;
    expect(windowSillReference(f, f.walls[0])).toMatchObject({
      source: "space",
      elevation: -0.02,
    });
  });
  it("falls back explicitly to an elevated floor and never includes wall base in the sill reference", () => {
    const f = windowScene().floors[0];
    f.elevation = 3;
    f.walls[0].base = 0.2;
    const reference = windowSillReference(f, f.walls[0]);
    expect(reference).toMatchObject({ source: "floor", elevation: 3 });
    expect(reference.note).toContain("Using the active Floor");
  });
  it("returns unknown without assuming zero when both space and floor levels are unknown", () => {
    const f = detected(rectangle()).floors[0];
    f.elevation = null;
    f.rooms[0].floorElevation = null;
    const reference = windowSillReference(f, f.walls[0]);
    expect(reference.elevation).toBeNull();
    expect(reference.note).toContain("Floor/Space elevation is unknown");
    expect(windowWorldElevationFromSill(reference.elevation, 0.9)).toBeNull();
    expect(windowTopFromHeight(null, 1.2)).toBeNull();
    expect(windowSillFromWorldElevation(0.9, null)).toBeNull();
  });
  it("handles conflicting adjacent levels deterministically with a disclosed floor fallback", () => {
    const f = spaceFixtures.levels().floors[0];
    const shared = f.walls.find((wall) =>
      f.rooms.every((r) => r.boundaryWallIds?.includes(wall.id)),
    )!;
    const reference = windowSillReference(f, shared);
    expect(reference).toMatchObject({ source: "floor", elevation: 0 });
    expect(reference.note).toContain("different floor elevations");
    f.rooms.reverse();
    expect(windowSillReference(f, shared)).toEqual(reference);
    f.elevation = null;
    expect(windowSillReference(f, shared).elevation).toBeNull();
    f.rooms.forEach((room) => {
      room.floorElevation = 0.45;
    });
    expect(windowSillReference(f, shared)).toMatchObject({
      source: "space",
      elevation: 0.45,
    });
  });
  it("does not use rejected spaces or missing and cross-floor hosts as references", () => {
    const f = detected(rectangle()).floors[0];
    f.elevation = null;
    f.rooms[0].verification = "REJECTED";
    expect(windowSillReference(f, f.walls[0]).elevation).toBeNull();
    expect(windowSillReference(f).elevation).toBeNull();
    expect(
      windowSillReference(f, { ...f.walls[0], floorId: "other" }).elevation,
    ).toBeNull();
  });
  it("reads existing world geometry and changes only displayed sill after a space level edit", () => {
    const s = detected(rectangle()),
      f = s.floors[0];
    const w = {
      ...windowScene().floors[0].windows[0],
      wallId: f.walls[0].id,
      floorId: f.id,
    };
    f.windows = [w];
    w.bottomElevation = 1.35;
    w.topElevation = 2.85;
    f.rooms[0].floorElevation = 0.45;
    const z = openingElevations(w, f.walls[0], f);
    expect(
      windowSillFromWorldElevation(
        z.bottom,
        windowSillReference(f, f.walls[0]).elevation,
      ),
    ).toBeCloseTo(0.9);
    expect(z.height).toBeCloseTo(1.5);
    w.bottomElevation = 0.9;
    w.topElevation = 2.4;
    f.rooms[0].floorElevation = 0;
    deriveRoomConnections(f);
    const changed = structuredClone(s);
    changed.floors[0].rooms[0].floorElevation = 0.1;
    const after = recomputeSceneSpaces(changed, s).scene.floors[0];
    expect(after.windows[0]).toEqual(w);
    expect(
      windowSillFromWorldElevation(
        w.bottomElevation,
        windowSillReference(after, after.walls[0]).elevation,
      ),
    ).toBeCloseTo(0.8);
  });
});

describe("window ghost projection", () => {
  it("projects off-axis pointers onto horizontal, vertical and angled wall axes", () => {
    const f = windowScene().floors[0],
      wall = f.walls[0];
    expect(windowPlacementAt({ x: 3, y: 0.2 }, wall, 1.2).position).toBe(3);
    const vertical = { ...wall, end: { x: 0, y: 8 } };
    expect(windowPlacementAt({ x: 0.2, y: 3 }, vertical, 1.2).position).toBe(3);
    const angled = { ...wall, end: { x: 6, y: 8 } };
    expect(
      windowPlacementAt({ x: 3.08, y: 3.94 }, angled, 1.2).position,
    ).toBeCloseTo(5);
  });
  it("fits inward at either endpoint without changing width", () => {
    const wall = windowScene().floors[0].walls[0];
    expect(windowPlacementAt({ x: -0.1, y: 0 }, wall, 1.2)).toEqual({
      position: 0,
      adjusted: true,
    });
    expect(windowPlacementAt({ x: 7.9, y: 0 }, wall, 1.2)).toEqual({
      position: 6.8,
      adjusted: true,
    });
    expect(windowPlacementAt({ x: 4, y: 0 }, wall, 1.2)).toEqual({
      position: 4,
      adjusted: false,
    });
  });
  it("keeps a window wider than the host invalid under the same scene validation", () => {
    const s = windowScene(),
      f = s.floors[0],
      w = f.windows[0];
    w.width = 10;
    w.positionAlongWall = windowPlacementAt(
      { x: 0, y: 0 },
      f.walls[0],
      w.width,
    ).position;
    expect(w.width).toBe(10);
    expect(
      validateScene(s).some(
        (issue) =>
          issue.entityId === w.id &&
          issue.severity === "error" &&
          issue.code === "WINDOW_OUTSIDE_HOST_WALL",
      ),
    ).toBe(true);
  });
  it("validates converted vertical geometry through the existing validator", () => {
    const s = windowScene(),
      w = s.floors[0].windows[0];
    w.bottomElevation = windowWorldElevationFromSill(0.45, 0.9);
    w.topElevation = windowTopFromHeight(w.bottomElevation, 0);
    expect(
      validateScene(s).some((i) => i.code === "WINDOW_INVALID_ELEVATION"),
    ).toBe(true);
    w.topElevation = windowTopFromHeight(w.bottomElevation, 3);
    expect(
      validateScene(s).some((i) => i.code === "WINDOW_EXCEEDS_WALL_HEIGHT"),
    ).toBe(true);
  });
});
