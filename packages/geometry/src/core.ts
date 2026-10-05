import {
  openingElevations,
  physicalOpeningOverlap,
  reverseWindowPanels,
} from "./windows";
import {
  entitiesOf,
  sceneSchema,
  type HomeScene,
  type Point,
  type Floor,
  type Wall,
  type Door,
} from "@habitat/domain";
export const distance = (a: Point, b: Point) =>
  Math.hypot(b.x - a.x, b.y - a.y);
export const area = (p: Point[]) =>
  Math.abs(
    p.reduce((s, a, i) => {
      const b = p[(i + 1) % p.length];
      return s + a.x * b.y - b.x * a.y;
    }, 0),
  ) / 2;
export const centroid = (p: Point[]) => ({
  x: p.reduce((n, a) => n + a.x, 0) / p.length,
  y: p.reduce((n, a) => n + a.y, 0) / p.length,
});
const cross = (a: Point, b: Point, c: Point) =>
  (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
const on = (a: Point, b: Point, c: Point) =>
  Math.abs(cross(a, b, c)) < 1e-8 &&
  c.x >= Math.min(a.x, b.x) - 1e-8 &&
  c.x <= Math.max(a.x, b.x) + 1e-8 &&
  c.y >= Math.min(a.y, b.y) - 1e-8 &&
  c.y <= Math.max(a.y, b.y) + 1e-8;
export function intersects(a: Point, b: Point, c: Point, d: Point) {
  return (
    (cross(a, b, c) * cross(a, b, d) < 0 &&
      cross(c, d, a) * cross(c, d, b) < 0) ||
    on(a, b, c) ||
    on(a, b, d) ||
    on(c, d, a) ||
    on(c, d, b)
  );
}
export function simplePolygon(p: Point[]) {
  if (area(p) < 1e-8) return false;
  for (let i = 0; i < p.length; i++) {
    if (distance(p[i], p[(i + 1) % p.length]) < 1e-8) return false;
    for (let j = i + 1; j < p.length; j++) {
      if (j === i + 1 || (i === 0 && j === p.length - 1)) continue;
      if (intersects(p[i], p[(i + 1) % p.length], p[j], p[(j + 1) % p.length]))
        return false;
    }
  }
  return true;
}
export function wallPoint(w: Wall, t: number): Point {
  const len = distance(w.start, w.end);
  return {
    x: w.start.x + ((w.end.x - w.start.x) * t) / len,
    y: w.start.y + ((w.end.y - w.start.y) * t) / len,
  };
}
/** Legacy snapshots used the centre; new placements explicitly use opening start. */
export function openingInterval(
  o: Pick<Door, "positionAlongWall" | "width" | "positionReference">,
) {
  if (o.positionAlongWall === null || o.width === null) return null;
  const start =
    o.positionReference === "OPENING_START"
      ? o.positionAlongWall
      : o.positionAlongWall - o.width / 2;
  return { start, end: start + o.width, center: start + o.width / 2 };
}
/** Canonical +left normal = (-dy, dx). Never infer from camera or legacy direction.
 * Leaf tip is a 90-degree swing-envelope rendering convention, not physical state.
 */
export function doorSwing(w: Wall, door: Door) {
  const interval = openingInterval(door),
    orientation = door.hingedOrientation;
  const length = distance(w.start, w.end);
  if (
    door.type !== "hinged" ||
    !orientation ||
    !interval ||
    !door.width ||
    !length
  )
    return null;
  const atStart = orientation.hingeEndpoint === "OPENING_START";
  const side = orientation.swingSide === "WALL_LEFT" ? 1 : -1;
  const hinge = wallPoint(w, atStart ? interval.start : interval.end);
  const closedTip = wallPoint(w, atStart ? interval.end : interval.start);
  const normal = {
    x: (-(w.end.y - w.start.y) / length) * side,
    y: ((w.end.x - w.start.x) / length) * side,
  };
  return {
    hinge,
    closedTip,
    leafTip: {
      x: hinge.x + normal.x * door.width,
      y: hinge.y + normal.y * door.width,
    },
    sweep: (atStart ? side : -side) > 0 ? 1 : 0,
  };
}
export function flipHinge(door: Door): Door {
  if (door.type !== "hinged" || !door.hingedOrientation)
    throw new Error("Choose a known hinged orientation first");
  return {
    ...door,
    hingedOrientation: {
      ...door.hingedOrientation,
      hingeEndpoint:
        door.hingedOrientation.hingeEndpoint === "OPENING_START"
          ? "OPENING_END"
          : "OPENING_START",
    },
  };
}
export function flipSwing(door: Door): Door {
  if (door.type !== "hinged" || !door.hingedOrientation)
    throw new Error("Choose a known hinged orientation first");
  return {
    ...door,
    hingedOrientation: {
      ...door.hingedOrientation,
      swingSide:
        door.hingedOrientation.swingSide === "WALL_LEFT"
          ? "WALL_RIGHT"
          : "WALL_LEFT",
    },
  };
}
/** Explicit reversal only; transforms every hosted interval and room-side reference. */
export function reverseWall(floor: Floor, wallId: string): Floor {
  const result: Floor = JSON.parse(JSON.stringify(floor)),
    wall = result.walls.find((w) => w.id === wallId);
  if (!wall) throw new Error("Host wall not found");
  const length = distance(wall.start, wall.end);
  [wall.start, wall.end] = [wall.end, wall.start];
  [wall.leftRoomId, wall.rightRoomId] = [wall.rightRoomId, wall.leftRoomId];
  for (const o of [...result.doors, ...result.windows, ...result.openings]) {
    if (o.wallId !== wallId) continue;
    if (o.positionAlongWall !== null) {
      if (o.positionReference && o.width === null)
        throw new Error("Cannot reverse opening with unknown width");
      o.positionAlongWall =
        length - o.positionAlongWall - (o.positionReference ? o.width! : 0);
    }
    if (o.kind === "window") reverseWindowPanels(o);
    if (o.kind === "door" && o.hingedOrientation)
      o.hingedOrientation = flipSwing(flipHinge(o)).hingedOrientation;
  }
  return result;
}
export { connectivity } from "@habitat/domain/topology";
export type Issue = {
  code?: string;
  entityId: string;
  message: string;
  severity: "error" | "warning";
};
export function validateBaseScene(input: HomeScene): Issue[] {
  const scene = sceneSchema.parse(input),
    issues: Issue[] = [];
  const ids = new Set<string>(),
    evidenceIds = new Set(scene.evidence.map((e) => e.id));
  const add = (
    entityId: string,
    message: string,
    severity: "error" | "warning" = "error",
  ) => issues.push({ entityId, message, severity });
  if (evidenceIds.size !== scene.evidence.length)
    add(scene.id, "Duplicate evidence ID");
  for (const f of scene.floors) {
    for (const evidenceId of f.scale.evidenceIds)
      if (!evidenceIds.has(evidenceId))
        add(f.id, "Scale references missing evidence");
    if (ids.has(f.id)) add(f.id, "Duplicate floor ID");
    ids.add(f.id);
    const rooms = new Map(f.rooms.map((r) => [r.id, r])),
      walls = new Map(f.walls.map((w) => [w.id, w]));
    for (const e of entitiesOf(f)) {
      if (ids.has(e.id)) add(e.id, "Duplicate entity ID");
      ids.add(e.id);
      if (e.floorId !== f.id) add(e.id, "Entity belongs to another floor");
      for (const eid of e.evidenceIds)
        if (!evidenceIds.has(eid)) add(e.id, "Missing evidence");
      if (e.kind === "room")
        for (const claim of [e.semantic, e.geometry])
          for (const eid of claim.evidenceIds)
            if (!evidenceIds.has(eid))
              add(e.id, "Room claim references missing evidence");
      if (
        "boundary" in e &&
        !(
          e.kind === "room" &&
          e.enclosureStatus === "OPEN" &&
          !e.boundary.length
        ) &&
        !simplePolygon(e.boundary)
      )
        add(e.id, "Boundary is self-intersecting or degenerate");
      if (
        e.kind === "room" &&
        e.area !== null &&
        Math.abs(e.area - area(e.boundary)) > 0.01
      )
        add(e.id, "Area disagrees with boundary");
      if (
        e.kind === "stair" &&
        e.targetFloorId &&
        !scene.floors.some((f) => f.id === e.targetFloorId)
      )
        add(e.id, "Missing target floor");
      if (e.kind === "zone" && e.roomIds.some((id) => !rooms.has(id)))
        add(e.id, "Zone references missing room");
    }
    for (const r of f.rooms) {
      if (r.boundarySource !== "walls" || r.boundaryEdges) continue;
      const boundaryWalls = (r.boundaryWallIds ?? [])
        .map((id) => walls.get(id))
        .filter((w): w is Wall => !!w && w.verification !== "REJECTED");
      if (
        !r.boundaryWallIds?.length ||
        boundaryWalls.length !== r.boundaryWallIds.length
      )
        add(r.id, "Room boundary references missing walls");
      for (let i = 0; i < r.boundary.length; i++) {
        const a = r.boundary[i],
          b = r.boundary[(i + 1) % r.boundary.length],
          len = distance(a, b);
        const spans = boundaryWalls
          .filter(
            (w) =>
              Math.abs(cross(a, b, w.start)) < 1e-6 &&
              Math.abs(cross(a, b, w.end)) < 1e-6,
          )
          .map((w) => {
            const project = (p: Point) =>
              ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) /
              (len || 1);
            return [
              Math.min(project(w.start), project(w.end)),
              Math.max(project(w.start), project(w.end)),
            ];
          })
          .sort((a, b) => a[0] - b[0]);
        let covered = 0;
        for (const [start, end] of spans) {
          if (start > covered + 1e-6) break;
          covered = Math.max(covered, end);
        }
        if (covered < len - 1e-6) {
          add(r.id, "Room boundary is open or no longer follows its walls");
          break;
        }
      }
    }
    for (const d of f.dimensions) {
      if (
        d.value !== null &&
        Math.abs(d.value - distance(d.start, d.end)) > 0.01
      )
        add(d.id, "Dimension value disagrees with its endpoints");
      for (const endpoint of ["start", "end"] as const) {
        const anchor = d[endpoint === "start" ? "startAnchor" : "endAnchor"];
        if (anchor) {
          const wall = walls.get(anchor.wallId);
          if (!wall || distance(wall[anchor.endpoint], d[endpoint]) > 1e-6)
            add(
              d.id,
              "Dimension reference moved or disappeared; update or delete the stale dimension",
            );
        }
      }
    }
    for (let i = 0; i < f.walls.length; i++)
      for (let j = i + 1; j < f.walls.length; j++) {
        const a = f.walls[i],
          b = f.walls[j],
          length = distance(a.start, a.end);
        if (
          a.verification === "REJECTED" ||
          b.verification === "REJECTED" ||
          length < 1e-8
        )
          continue;
        if (
          Math.abs(cross(a.start, a.end, b.start)) < 1e-7 &&
          Math.abs(cross(a.start, a.end, b.end)) < 1e-7
        ) {
          const along = (p: Point) =>
            ((p.x - a.start.x) * (a.end.x - a.start.x) +
              (p.y - a.start.y) * (a.end.y - a.start.y)) /
            length;
          const start = Math.max(0, Math.min(along(b.start), along(b.end))),
            end = Math.min(length, Math.max(along(b.start), along(b.end)));
          if (end - start > 1e-6)
            add(a.id, "Walls overlap along the same physical segment");
        }
      }
    const segments = new Set<string>();
    for (const w of f.walls) {
      if (distance(w.start, w.end) < 1e-6) add(w.id, "Wall has zero length");
      const key = [`${w.start.x},${w.start.y}`, `${w.end.x},${w.end.y}`]
        .sort()
        .join(":");
      if (segments.has(key)) add(w.id, "Duplicate shared wall");
      segments.add(key);
      for (const rid of [w.leftRoomId, w.rightRoomId])
        if (rid && !rooms.has(rid)) add(w.id, "Wall references missing room");
      for (const wid of w.connectedWallIds) {
        const connected = walls.get(wid);
        if (!connected) add(w.id, "Missing connected wall");
        else if (
          wid === w.id ||
          ![w.start, w.end].some((a) =>
            [connected.start, connected.end].some((b) => distance(a, b) < 1e-6),
          ) ||
          !connected.connectedWallIds.includes(w.id)
        )
          add(
            w.id,
            "Wall connectivity must be reciprocal and share an endpoint",
          );
      }
      if (w.height === null || w.thickness === null || w.base === null)
        add(
          w.id,
          "Wall dimensions unknown; solid 3D geometry omitted",
          "warning",
        );
    }
    const hosted = [...f.doors, ...f.windows, ...f.openings].filter(
      (o) => o.verification !== "REJECTED",
    );
    for (const o of hosted) {
      if (o.kind === "door" && o.type !== "hinged" && o.hingedOrientation)
        add(o.id, "Only hinged doors may have hinged orientation");
      const w = walls.get(o.wallId);
      if (!w || w.verification === "REJECTED") {
        add(o.id, "Opening requires an active host wall");
        continue;
      }
      for (const rid of [o.fromRoomId, o.toRoomId])
        if (
          rid &&
          (!rooms.has(rid) ||
            rooms.get(rid)?.verification === "REJECTED" ||
            ![w.leftRoomId, w.rightRoomId].includes(rid))
        )
          add(o.id, "Opening room must be adjacent to its host wall");
      if (o.fromRoomId && o.fromRoomId === o.toRoomId)
        add(o.id, "Opening cannot connect a room to itself");
      if (o.kind === "window") continue;
      if (
        o.width !== null &&
        o.positionAlongWall !== null &&
        (openingInterval(o)!.start < -1e-8 ||
          openingInterval(o)!.end > distance(w.start, w.end) + 1e-8)
      )
        add(o.id, "Opening extends beyond its host wall");
      if (
        o.height !== null &&
        o.sillHeight !== null &&
        w.height !== null &&
        o.height + o.sillHeight > w.height + 1e-8
      )
        add(o.id, "Opening exceeds host wall height");
      if (
        o.height === null ||
        o.sillHeight === null ||
        o.width === null ||
        o.positionAlongWall === null
      )
        add(
          o.id,
          "Opening dimensions unknown; host solid omitted in 3D",
          "warning",
        );
    }
    for (let i = 0; i < hosted.length; i++)
      for (let j = i + 1; j < hosted.length; j++) {
        const a = hosted[i],
          b = hosted[j];
        const wall = walls.get(a.wallId);
        if (
          a.kind !== "window" &&
          b.kind !== "window" &&
          wall &&
          physicalOpeningOverlap(a, b, wall, f)
        )
          add(a.id, "Hosted openings overlap");
      }
    if (f.scale.status !== "VERIFIED")
      add(f.id, "Scale needs verification", "warning");
    if (f.elevation === null) add(f.id, "Floor elevation unknown", "warning");
  }
  return issues;
}
export function assertBaseScene(scene: HomeScene) {
  const errors = validateBaseScene(scene).filter((i) => i.severity === "error");
  if (errors.length) throw new Error(errors.map((i) => i.message).join("; "));
  return scene;
}
export function projectBaseFloor(floor: Floor) {
  const openings = [...floor.doors, ...floor.windows, ...floor.openings].filter(
    (o) => o.verification !== "REJECTED",
  );
  const walls = floor.walls
    .filter((w) => w.verification !== "REJECTED")
    .map((w) => ({
      ...w,
      length: distance(w.start, w.end),
      angle: Math.atan2(w.end.y - w.start.y, w.end.x - w.start.x),
      openings: openings.filter((o) => o.wallId === w.id),
    }));
  const solids: {
    id: string;
    wallId: string;
    start: Point;
    end: Point;
    bottom: number;
    height: number;
    thickness: number;
  }[] = [];
  for (const w of walls) {
    if (
      w.height === null ||
      w.thickness === null ||
      w.base === null ||
      floor.elevation === null
    )
      continue;
    if (
      w.openings.some(
        (o) =>
          o.width === null ||
          o.positionAlongWall === null ||
          openingElevations(o, w, floor).bottom === null ||
          openingElevations(o, w, floor).top === null,
      )
    )
      continue;
    const base = floor.elevation + w.base;
    const cuts = w.openings.map((o) => ({
      ...openingInterval(o)!,
      bottom: openingElevations(o, w, floor).bottom! - base,
      top: openingElevations(o, w, floor).top! - base,
    }));
    // Invalid drafts never create out-of-bounds solids or silently resize openings.
    if (
      cuts.some(
        (c) =>
          c.start < -1e-8 ||
          c.end > w.length + 1e-8 ||
          c.bottom < -1e-8 ||
          c.top > w.height! + 1e-8 ||
          c.end <= c.start ||
          c.top <= c.bottom,
      )
    )
      continue;
    const add = (a: number, b: number, bottom: number, height: number) => {
      if (b - a > 1e-8 && height > 1e-8)
        solids.push({
          id: `${w.id}-${solids.length}`,
          wallId: w.id,
          start: wallPoint(w, a),
          end: wallPoint(w, b),
          bottom: floor.elevation! + w.base! + bottom,
          height,
          thickness: w.thickness!,
        });
    };
    const xs = [
      ...new Set([0, w.length, ...cuts.flatMap((c) => [c.start, c.end])]),
    ].sort((a, b) => a - b);
    for (let i = 0; i < xs.length - 1; i++) {
      const left = xs[i],
        right = xs[i + 1],
        mid = (left + right) / 2;
      const intervals = cuts
        .filter((c) => c.start < mid && c.end > mid)
        .sort((a, b) => a.bottom - b.bottom);
      let z = 0;
      for (const c of intervals) {
        add(left, right, z, c.bottom - z);
        z = Math.max(z, c.top);
      }
      add(left, right, z, w.height - z);
    }
  }
  return {
    floorId: floor.id,
    elevation: floor.elevation,
    rooms: floor.rooms
      .filter((r) => r.verification !== "REJECTED")
      .map((r) => ({
        ...r,
        computedArea: area(r.boundary),
        center: centroid(r.boundary),
      })),
    walls,
    openings,
    solids,
    columns: floor.columns,
    dimensions: floor.dimensions,
  };
}
export function calibrate(a: Point, b: Point, meters: number) {
  if (!Number.isFinite(meters) || meters <= 0 || distance(a, b) < 1e-6)
    throw new Error(
      "Calibration requires distinct points and a positive distance",
    );
  return {
    metersPerPixel: meters / distance(a, b),
    sourceOrigin: a,
    worldOrigin: { x: 0, y: 0 },
    rotation: 0,
  };
}

// Architectural editing helpers. Pure, world-space operations; no viewer state.
export function pointInPolygon(p: Point, polygon: Point[]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i],
      b = polygon[j];
    if (
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
    )
      inside = !inside;
  }
  return inside;
}
export function projectOnWall(p: Point, w: Wall) {
  const length = distance(w.start, w.end);
  if (!length) return { point: w.start, along: 0 };
  const along = Math.max(
    0,
    Math.min(
      length,
      ((p.x - w.start.x) * (w.end.x - w.start.x) +
        (p.y - w.start.y) * (w.end.y - w.start.y)) /
        length,
    ),
  );
  return { point: wallPoint(w, along), along };
}
export function segmentIntersection(a: Wall, b: Wall): Point | null {
  const dx = a.end.x - a.start.x,
    dy = a.end.y - a.start.y,
    ex = b.end.x - b.start.x,
    ey = b.end.y - b.start.y;
  const denominator = dx * ey - dy * ex;
  if (Math.abs(denominator) < 1e-9) return null;
  const x = b.start.x - a.start.x,
    y = b.start.y - a.start.y;
  const t = (x * ey - y * ex) / denominator,
    u = (x * dy - y * dx) / denominator;
  return t >= -1e-8 && t <= 1 + 1e-8 && u >= -1e-8 && u <= 1 + 1e-8
    ? { x: a.start.x + t * dx, y: a.start.y + t * dy }
    : null;
}
export function exactEndpoint(
  start: Point,
  toward: Point,
  length: number,
): Point {
  const d = distance(start, toward);
  if (!Number.isFinite(length) || length <= 0 || d < 1e-8)
    throw new Error("Choose a direction and a positive wall length");
  return {
    x: start.x + ((toward.x - start.x) * length) / d,
    y: start.y + ((toward.y - start.y) * length) / d,
  };
}
export function snapDrawing(
  p: Point,
  walls: Wall[],
  anchor?: Point,
  grid?: number,
  tolerance = 0.12,
) {
  const choices: { point: Point; label: string; priority: number }[] = [];
  for (const w of walls) {
    choices.push(
      ...[w.start, w.end].map((point) => ({
        point,
        label: "Endpoint",
        priority: 0,
      })),
    );
    choices.push({
      point: projectOnWall(p, w).point,
      label: "On wall",
      priority: 2,
    });
    if (anchor)
      choices.push({
        point: projectOnWall(anchor, w).point,
        label: "Perpendicular",
        priority: 1,
      });
  }
  for (let i = 0; i < walls.length; i++)
    for (let j = i + 1; j < walls.length; j++) {
      const point = segmentIntersection(walls[i], walls[j]);
      if (point) choices.push({ point, label: "Intersection", priority: 0 });
    }
  const near = choices
    .filter((c) => distance(c.point, p) < tolerance)
    .sort(
      (a, b) =>
        a.priority - b.priority || distance(a.point, p) - distance(b.point, p),
    )[0];
  if (near) return near;
  if (anchor && Math.abs(p.y - anchor.y) < tolerance)
    return {
      point: { x: grid ? Math.round(p.x / grid) * grid : p.x, y: anchor.y },
      label: "Horizontal",
    };
  if (anchor && Math.abs(p.x - anchor.x) < tolerance)
    return {
      point: { x: anchor.x, y: grid ? Math.round(p.y / grid) * grid : p.y },
      label: "Vertical",
    };
  if (grid)
    return {
      point: {
        x: Math.round(p.x / grid) * grid,
        y: Math.round(p.y / grid) * grid,
      },
      label: "Grid",
    };
  return { point: p, label: "" };
}
const pointKey = (p: Point) => `${p.x.toFixed(7)},${p.y.toFixed(7)}`;
/** Explicitly split at junctions, preserving direction, hosted positions and room references.
 * Splitting through an opening is blocked, never silently discarded or clamped.
 */
export function splitJunctions(floor: Floor, newId: () => string): Floor {
  const result: Floor = JSON.parse(JSON.stringify(floor));
  const replacement = new Map<string, string[]>();
  result.walls = floor.walls.flatMap((w) => {
    const length = distance(w.start, w.end);
    if (length < 1e-8) throw new Error("Wall has zero length");
    const positions = [0, length];
    for (const other of floor.walls) {
      if (other.id === w.id) continue;
      for (const p of [
        other.start,
        other.end,
        segmentIntersection(w, other),
      ].filter((p): p is Point => p !== null)) {
        const projected = projectOnWall(p, w);
        if (distance(projected.point, p) < 1e-7)
          positions.push(projected.along);
      }
    }
    const cuts = positions
      .sort((a, b) => a - b)
      .filter((n, i, a) => i === 0 || n - a[i - 1] > 1e-7);
    const pieces = cuts.slice(0, -1).map((start, i) => ({
      ...w,
      id: i === 0 ? w.id : newId(),
      start: wallPoint(w, start),
      end: wallPoint(w, cuts[i + 1]),
      connectedWallIds: [],
    }));
    replacement.set(
      w.id,
      pieces.map((p) => p.id),
    );
    for (const o of [
      ...result.doors,
      ...result.windows,
      ...result.openings,
    ].filter((o) => o.wallId === w.id)) {
      const interval = openingInterval(o);
      if (pieces.length === 1) continue;
      if (!interval)
        throw new Error(
          `Cannot split ${w.name}: ${o.name} has unknown placement`,
        );
      if (
        cuts
          .slice(1, -1)
          .some((t) => t > interval.start + 1e-7 && t < interval.end - 1e-7)
      )
        throw new Error(
          `Junction crosses ${o.name}. Move the opening before drawing here.`,
        );
      const index = pieces.findIndex(
        (_, i) =>
          interval.start >= cuts[i] - 1e-7 &&
          interval.end <= cuts[i + 1] + 1e-7,
      );
      if (index < 0) throw new Error(`${o.name} does not fit its host wall`);
      o.wallId = pieces[index].id;
      o.positionAlongWall! -= cuts[index];
    }
    return pieces;
  });
  for (const room of result.rooms)
    if (room.boundaryWallIds)
      room.boundaryWallIds = room.boundaryWallIds.flatMap(
        (id) => replacement.get(id) ?? [id],
      );
  reconnectWalls(result);
  return result;
}
export function reconnectWalls(floor: Floor) {
  for (const w of floor.walls)
    w.connectedWallIds = floor.walls
      .filter(
        (o) =>
          o.id !== w.id &&
          [w.start, w.end].some((a) =>
            [o.start, o.end].some((b) => distance(a, b) < 1e-7),
          ),
      )
      .map((o) => o.id);
}
export type ClosedRegion = { boundary: Point[]; wallIds: string[] };
/** Half-edge traversal of bounded faces; requires explicit junction segments. */
export function closedRegions(floor: Floor): ClosedRegion[] {
  type Edge = { from: Point; to: Point; wallId: string; key: string };
  const graph = new Map<string, Edge[]>(),
    edges: Edge[] = [];
  for (const w of floor.walls.filter((w) => w.verification !== "REJECTED"))
    for (const [from, to] of [
      [w.start, w.end],
      [w.end, w.start],
    ]) {
      const edge = { from, to, wallId: w.id, key: `${w.id}:${pointKey(from)}` };
      edges.push(edge);
      const key = pointKey(from);
      graph.set(key, [...(graph.get(key) ?? []), edge]);
    }
  for (const list of graph.values())
    list.sort(
      (a, b) =>
        Math.atan2(a.to.y - a.from.y, a.to.x - a.from.x) -
        Math.atan2(b.to.y - b.from.y, b.to.x - b.from.x),
    );
  const visited = new Set<string>(),
    regions: ClosedRegion[] = [];
  for (const first of edges) {
    if (visited.has(first.key)) continue;
    let edge = first;
    const boundary: Point[] = [],
      wallIds: string[] = [];
    for (let count = 0; count <= edges.length; count++) {
      if (visited.has(edge.key)) break;
      visited.add(edge.key);
      boundary.push(edge.from);
      wallIds.push(edge.wallId);
      const exits = graph.get(pointKey(edge.to))!;
      const back = exits.findIndex(
        (e) =>
          e.wallId === edge.wallId && pointKey(e.to) === pointKey(edge.from),
      );
      edge = exits[(back - 1 + exits.length) % exits.length];
      if (edge.key === first.key) {
        const signed = boundary.reduce((s, p, i) => {
          const q = boundary[(i + 1) % boundary.length];
          return s + p.x * q.y - q.x * p.y;
        }, 0);
        if (signed > 1e-7 && simplePolygon(boundary))
          regions.push({ boundary, wallIds });
        break;
      }
    }
  }
  return regions;
}
export function regionAt(floor: Floor, p: Point) {
  const region = closedRegions(floor)
    .filter((r) => pointInPolygon(p, r.boundary))
    .sort((a, b) => area(a.boundary) - area(b.boundary))[0];
  if (!region) {
    const ends = floor.walls
      .flatMap((w) => [w.start, w.end])
      .filter(
        (p) =>
          floor.walls
            .flatMap((w) => [w.start, w.end])
            .filter((q) => distance(p, q) < 1e-7).length === 1,
      );
    const gaps = ends
      .flatMap((p, i) => ends.slice(i + 1).map((q) => distance(p, q)))
      .filter((d) => d > 1e-7);
    throw new Error(
      `Room boundary is open or has no valid enclosed region.${gaps.length ? ` Nearest loose endpoints are ${(Math.min(...gaps) * 100).toFixed(0)} cm apart.` : ""}`,
    );
  }
  return region;
}
/** Rebuild adjacency from enclosed room geometry; swing does not participate. */
export function deriveRoomConnections(floor: Floor) {
  for (const w of floor.walls) {
    // Only wall-derived rooms claim automatic adjacency; legacy references remain.
    for (const side of ["leftRoomId", "rightRoomId"] as const) {
      const previous = floor.rooms.find((r) => r.id === w[side]);
      if (previous?.boundarySource === "walls") w[side] = null;
    }
    const length = distance(w.start, w.end);
    if (!length) continue;
    const mid = wallPoint(w, length / 2),
      epsilon = 1e-4;
    for (const room of floor.rooms.filter(
      (r) => r.boundarySource === "walls" && r.boundaryWallIds?.includes(w.id),
    )) {
      if (
        pointInPolygon(
          {
            x: mid.x - ((w.end.y - w.start.y) / length) * epsilon,
            y: mid.y + ((w.end.x - w.start.x) / length) * epsilon,
          },
          room.boundary,
        )
      )
        w.leftRoomId = room.id;
      if (
        pointInPolygon(
          {
            x: mid.x + ((w.end.y - w.start.y) / length) * epsilon,
            y: mid.y - ((w.end.x - w.start.x) / length) * epsilon,
          },
          room.boundary,
        )
      )
        w.rightRoomId = room.id;
    }
  }
  for (const o of [...floor.doors, ...floor.windows, ...floor.openings]) {
    const w = floor.walls.find((w) => w.id === o.wallId);
    if (!w) continue;
    if (
      floor.rooms.some(
        (r) =>
          r.boundarySource === "walls" && r.boundaryWallIds?.includes(w.id),
      )
    ) {
      o.fromRoomId = w.leftRoomId;
      o.toRoomId = w.rightRoomId;
    }
  }
}
export function moveWall(
  floor: Floor,
  id: string,
  start: Point,
  end: Point,
): Floor {
  const next: Floor = JSON.parse(JSON.stringify(floor)),
    wall = next.walls.find((w) => w.id === id);
  if (!wall) throw new Error("Wall not found on active floor");
  const before = [wall.start, wall.end],
    after = [start, end];
  const move = (p: Point) => {
    const index = before.findIndex((q) => distance(p, q) < 1e-7);
    return index < 0 ? p : { ...after[index] };
  };
  for (const w of next.walls) {
    w.start = move(w.start);
    w.end = move(w.end);
  }
  for (const r of next.rooms.filter((r) => r.boundarySource === "walls")) {
    r.boundary = r.boundary.map(move);
    r.area = area(r.boundary);
  }
  reconnectWalls(next);
  deriveRoomConnections(next);
  return next;
}
export function wallDependencies(floor: Floor, id: string) {
  return [
    ...floor.doors,
    ...floor.windows,
    ...floor.openings,
    ...floor.rooms,
  ].filter((e) =>
    "wallId" in e
      ? e.wallId === id
      : e.boundaryWallIds?.includes(id) ||
        floor.walls.some(
          (w) => w.id === id && [w.leftRoomId, w.rightRoomId].includes(e.id),
        ),
  );
}
