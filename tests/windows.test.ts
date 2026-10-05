import { describe, it, expect } from "vitest";
import {
  newWindowAssembly,
  sceneSchema,
  type WindowPanel,
} from "@habitat/domain";
import { createFixture, uuid } from "@habitat/domain/fixture";
import {
  validateWindows,
  validateScene,
  openingElevations,
  openingInterval,
  windowSills,
  windowDragPosition,
  visibleGlassSize,
  windowRenderParts,
  moveWall,
  reverseWall,
  splitJunctions,
  projectFloor,
  wallPoint,
  wallDependencies,
} from "@habitat/geometry";
import { windowScene } from "./window-fixtures";
const errors = (s: ReturnType<typeof windowScene>) =>
  validateWindows(s)
    .filter((i) => i.severity === "error")
    .map((i) => i.code);
describe("window placement and world geometry", () => {
  it("keeps start placement, identity, elevation and assembly through movement and rotation", () => {
    const s = windowScene(),
      f = s.floors[0],
      w = f.windows[0],
      host = f.walls[0];
    expect(errors(s)).toEqual([]);
    expect(openingInterval(w)).toEqual({ start: 1, end: 3.4, center: 2.2 });
    const moved = moveWall(f, host.id, { x: 10, y: 2 }, { x: 10, y: 10 });
    expect(moved.windows[0]).toEqual(w);
    expect(wallPoint(moved.walls[0], 1)).toEqual({ x: 10, y: 3 });
    expect(
      windowDragPosition(w, moved.walls[0], { x: 10, y: 3 }, { x: 50, y: 4 }),
    ).toBe(2);
    expect(windowDragPosition(w, host, { x: 1, y: 0 }, { x: -3, y: 30 })).toBe(
      -3,
    );
    const short = moveWall(f, host.id, host.start, { x: 3, y: 0 });
    expect(short.windows[0]).toEqual(w);
    expect(errors({ ...s, floors: [short] })).toContain(
      "WINDOW_OUTSIDE_HOST_WALL",
    );
    expect(wallDependencies(f, host.id)).toContain(w);
  });
  it("rejects missing hosts, cross-floor hosts, invalid position and width without clamping", () => {
    const s = windowScene(),
      f = s.floors[0],
      w = f.windows[0];
    w.wallId = uuid(9999);
    expect(errors(s)).toContain("WINDOW_MISSING_HOST_WALL");
    const other = structuredClone(f);
    other.id = uuid(9998);
    other.windows = [];
    other.walls.forEach((h) => (h.floorId = other.id));
    f.walls = [];
    w.wallId = other.walls[0].id;
    s.floors.push(other);
    expect(errors(s)).toContain("WINDOW_HOST_FLOOR_MISMATCH");
    w.positionAlongWall = -1;
    w.width = 0;
    expect(errors(s)).toEqual(
      expect.arrayContaining([
        "WINDOW_INVALID_POSITION",
        "WINDOW_INVALID_WIDTH",
      ]),
    );
  });
  it("remaps panels, hinges, swing and sliding direction only on explicit reversal", () => {
    const s = windowScene(),
      f = s.floors[0],
      w = f.windows[0],
      p = w.assembly!.panels![0];
    Object.assign(p, {
      function: "OPERABLE",
      operation: "CASEMENT",
      orientation: { hingeEndpoint: "PANEL_START", swingSide: "WALL_LEFT" },
    });
    const split = splitJunctions(f, () => uuid(9999));
    expect(split.windows).toEqual(f.windows);
    expect(split.walls[0].start).toEqual(f.walls[0].start);
    const reversed = reverseWall(f, w.wallId),
      rw = reversed.windows[0];
    expect(rw.positionAlongWall).toBeCloseTo(4.6);
    expect(rw.assembly!.panels![0].region.x).toBeCloseTo(2 / 3);
    expect(rw.assembly!.panels![0].orientation).toEqual({
      hingeEndpoint: "PANEL_END",
      swingSide: "WALL_RIGHT",
    });
    expect(rw.assembly!.panels![1].slideDirection).toBe("TOWARD_PANEL_END");
    expect(rw.assembly!.panels!.map((p) => p.id)).toEqual(
      w.assembly!.panels!.map((p) => p.id),
    );
    expect(errors({ ...s, floors: [reversed] })).toEqual([]);
    expect(
      reverseWall(reversed, w.wallId).windows[0].positionAlongWall,
    ).toBeCloseTo(1);
  });
  it("derives height and relative Space sills without moving world elevations", () => {
    const s = windowScene(),
      f = s.floors[0],
      w = f.windows[0],
      h = f.walls[0];
    w.topElevation = 2.1;
    expect(openingElevations(w, h, f).height).toBeCloseTo(1.2);
    const r = createFixture().floors[0].rooms[0];
    r.floorId = f.id;
    r.floorElevation = 0;
    f.rooms.push(r);
    h.leftRoomId = r.id;
    expect(windowSills(w, h, f)[0].sillHeight).toBe(0.9);
    r.floorElevation = 0.1;
    expect(windowSills(w, h, f)[0].sillHeight).toBe(0.8);
    expect(w.bottomElevation).toBe(0.9);
    w.bottomElevation = 0;
    expect(errors(s)).toEqual([]);
    w.bottomElevation = -0.1;
    expect(errors(s)).toContain("WINDOW_BELOW_WALL_BASE");
    f.elevation = -1;
    expect(errors(s)).toContain("WINDOW_EXCEEDS_WALL_HEIGHT");
    w.topElevation = 1.5;
    expect(errors(s)).toEqual([]);
    w.topElevation = -0.2;
    expect(errors(s)).toContain("WINDOW_INVALID_ELEVATION");
    w.height = 1;
    expect(errors(s)).toContain("WINDOW_INVALID_ELEVATION");
  });
  it("preserves legacy centre and sill reference, including unknowns", () => {
    const s = createFixture(),
      f = s.floors[0],
      w = f.windows[0],
      host = f.walls.find((h) => h.id === w.wallId)!;
    expect(sceneSchema.parse(s)).toEqual(s);
    expect(w.assembly).toBeUndefined();
    expect(openingElevations(w, host, f).bottom).toBe(
      f.elevation! + host.base! + w.sillHeight!,
    );
    expect(openingInterval(w)!.start).toBe(w.positionAlongWall! - w.width! / 2);
    f.elevation = null;
    expect(openingElevations(w, host, f).bottom).toBeNull();
    expect(projectFloor(f).solids).toHaveLength(0);
    expect(w.assembly).toBeUndefined();
  });
});
describe("window assemblies", () => {
  it.each([1, 2, 3])("validates %i columns and rows", (count) => {
    for (const rows of [false, true]) {
      const s = windowScene(),
        w = s.floors[0].windows[0];
      w.assembly!.panels = Array.from({ length: count }, (_, index) => ({
        ...newWindowAssembly(uuid(6200 + index)).panels![0],
        index,
        function: "FIXED",
        operation: "FIXED",
        region: rows
          ? { x: 0, y: index / count, width: 1, height: 1 / count }
          : { x: index / count, y: 0, width: 1 / count, height: 1 },
      }));
      expect(errors(s)).toEqual([]);
      const parts = windowRenderParts(
        w,
        s.floors[0].walls[0],
        s.floors[0],
      ).parts;
      expect(parts.filter((p) => p.role === "glass")).toHaveLength(count);
      expect(
        parts.filter((p) => p.role === (rows ? "transom" : "mullion")),
      ).toHaveLength(count - 1);
    }
  });
  it("rejects gaps, overlaps, outside, duplicate identities and inconsistent operations", () => {
    const s = windowScene(),
      a = s.floors[0].windows[0].assembly!,
      panels = a.panels!;
    panels[1].region.x = 0;
    expect(errors(s)).toContain("WINDOW_INVALID_PANEL_LAYOUT");
    panels[1].region.x = 1 / 3;
    panels[2].region.width = 0.2;
    expect(errors(s)).toContain("WINDOW_INVALID_PANEL_LAYOUT");
    panels[2].region.width = 1 / 3;
    panels[2].id = panels[0].id;
    expect(errors(s)).toContain("WINDOW_INVALID_PANEL_LAYOUT");
    panels[2].id = uuid(6209);
    panels[0].region.y = -0.1;
    expect(errors(s)).toContain("WINDOW_INVALID_PANEL_LAYOUT");
    panels[0].region.y = 0;
    panels[1].orientation = {
      hingeEndpoint: "PANEL_START",
      swingSide: "UNKNOWN",
    };
    expect(errors(s)).toContain("WINDOW_INVALID_PANEL_OPERATION");
    panels[1].orientation = null;
    panels[0].function = "OPERABLE";
    expect(errors(s)).toContain("WINDOW_INVALID_PANEL_OPERATION");
  });
  it.each(["CASEMENT", "TILT_TURN", "AWNING"] as const)(
    "preserves %s orientation and panel IDs on property edits",
    (operation) => {
      const s = windowScene(),
        a = s.floors[0].windows[0].assembly!,
        p = a.panels![1];
      p.operation = operation;
      p.slideDirection = null;
      p.orientation =
        operation === "AWNING"
          ? null
          : { hingeEndpoint: "PANEL_END", swingSide: "WALL_RIGHT" };
      const ids = a.panels!.map((p) => p.id);
      a.glazing.glassFinish = "TINTED";
      expect(errors(s)).toEqual([]);
      expect(
        sceneSchema
          .parse(s)
          .floors[0].windows[0].assembly!.panels!.map((p) => p.id),
      ).toEqual(ids);
    },
  );
  it("keeps unknown profiles and glazing null; uses known faces for visible glass", () => {
    const s = windowScene(),
      f = s.floors[0],
      w = f.windows[0],
      p = w.assembly!.panels![1];
    expect(visibleGlassSize(w, p, 1.5)!.width).toBeCloseTo(0.7);
    w.assembly!.profile.frameFaceWidth = null;
    expect(visibleGlassSize(w, p, 1.5)).toBeNull();
    const before = structuredClone(w);
    expect(windowRenderParts(w, f.walls[0], f).illustrative).toBe(true);
    expect(w).toEqual(before);
    w.assembly = newWindowAssembly(uuid(8000));
    expect(errors(s)).toEqual([]);
    w.assembly.profile.frameDepth = -0.1;
    expect(errors(s)).toContain("WINDOW_INVALID_PROFILE");
    w.assembly.profile.frameDepth = null;
    w.assembly.glazing.glassThickness = -0.01;
    expect(errors(s)).toContain("WINDOW_INVALID_GLAZING");
    w.assembly.glazing.glassThickness = 0.05;
    w.assembly.glazing.overallGlazingThickness = 0.02;
    expect(errors(s)).toContain("WINDOW_INVALID_GLAZING");
  });
  it("rejects incompatible shutter configuration and structurally invalid screens", () => {
    const s = windowScene(),
      a = s.floors[0].windows[0].assembly!;
    a.shutter.type = "NONE";
    expect(errors(s)).toContain("WINDOW_INVALID_SHUTTER");
    a.shutter = { type: "UNKNOWN", operation: "ELECTRIC", boxType: "UNKNOWN" };
    expect(errors(s)).toContain("WINDOW_INVALID_SHUTTER");
    Object.assign(a.screen, { type: "CATALOG_PRODUCT" });
    expect(errors(s)).toContain("WINDOW_INVALID_SCREEN");
  });
});
describe("physical collisions and cutouts", () => {
  it("requires overlap on both axes, including doors, and subtracts stacked rectangles exactly", () => {
    const s = windowScene(),
      f = s.floors[0],
      w = f.windows[0],
      h = f.walls[0];
    w.assembly = null;
    w.bottomElevation = 0.2;
    w.topElevation = 1;
    const upper = {
      ...w,
      id: uuid(6300),
      bottomElevation: 1.5,
      topElevation: 2.4,
    };
    f.windows.push(upper);
    expect(errors(s)).toEqual([]);
    expect(validateScene(s).filter((i) => i.severity === "error")).toEqual([]);
    const solids = projectFloor(f).solids;
    const volume = solids.reduce(
      (v, s) =>
        v +
        Math.hypot(s.end.x - s.start.x, s.end.y - s.start.y) *
          s.height *
          s.thickness,
      0,
    );
    expect(volume).toBeCloseTo((8 * 3 - 2.4 * (0.8 + 0.9)) * 0.2);
    for (const opening of f.windows)
      for (const solid of solids) {
        const xOverlap =
          Math.min(solid.end.x, 3.4) - Math.max(solid.start.x, 1);
        const zOverlap =
          Math.min(solid.bottom + solid.height, opening.topElevation!) -
          Math.max(solid.bottom, opening.bottomElevation!);
        expect(xOverlap > 1e-7 && zOverlap > 1e-7).toBe(false);
      }
    upper.bottomElevation = 0.9;
    expect(errors(s)).toContain("WINDOW_OVERLAP");
    f.windows.pop();
    const legacyDoor = createFixture().floors[0].doors[0];
    f.doors.push({
      ...legacyDoor,
      floorId: f.id,
      wallId: h.id,
      fromRoomId: null,
      toRoomId: null,
      width: 1,
      height: 2.1,
      sillHeight: 0,
      positionAlongWall: 1,
      positionReference: "OPENING_START",
    });
    expect(errors(s)).toContain("WINDOW_OVERLAPS_DOOR");
    f.doors = [];
    f.windows = [];
    expect(projectFloor(f).solids).toHaveLength(1);
    expect(projectFloor(f).solids[0].height).toBe(3);
  });
  it("renders frame, sashes and glazing inside the host plane at world elevations", () => {
    const s = windowScene(),
      f = s.floors[0],
      w = f.windows[0],
      model = windowRenderParts(w, f.walls[0], f);
    expect(model.illustrative).toBe(false);
    expect(model.parts.filter((p) => p.role === "frame")).toHaveLength(4);
    expect(model.parts.filter((p) => p.role === "sash")).toHaveLength(8);
    expect(model.parts.filter((p) => p.role === "glass")).toHaveLength(3);
    expect(
      model.parts.filter((p) => p.role === "glass")[0].glazing?.glassFinish,
    ).toBe("FROSTED");
    for (const p of model.parts) {
      expect(p.x).toBeGreaterThanOrEqual(-1e-7);
      expect(p.x + p.width).toBeLessThanOrEqual(2.4 + 1e-7);
      expect(p.y + p.height).toBeLessThanOrEqual(1.5 + 1e-7);
    }
    const unknown: WindowPanel = newWindowAssembly(uuid(9000)).panels![0];
    expect(unknown.orientation).toBeNull();
  });
});
