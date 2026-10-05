import {
  spaceGeometryProtected,
  type Floor,
  type HomeScene,
  type Point,
  type Room,
  type SpaceBoundaryEdge,
} from "@habitat/domain";
import {
  area,
  distance,
  intersects,
  pointInPolygon,
  simplePolygon,
  deriveRoomConnections,
} from "./core";

/** Metres, independent of editor snapping. Never bridge a physical gap with this tolerance. */
export const SPACE_TOLERANCE = 1e-8;
const eps = SPACE_TOLERANCE;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const key = (p: Point) => `${p.x},${p.y}`;
const cross = (a: Point, b: Point, c: Point) =>
  (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
const signedArea = (p: Point[]) =>
  p.reduce((s, a, i) => {
    const b = p[(i + 1) % p.length];
    return s + a.x * b.y - b.x * a.y;
  }, 0) / 2;
export type SpaceCandidate = Pick<
  Room,
  "boundary" | "boundaryEdges" | "boundaryWallIds" | "area" | "enclosureStatus"
> & { boundaryEdges: SpaceBoundaryEdge[] };
export type SpaceIssue = {
  entityId: string;
  code: string;
  severity: "error" | "warning";
  message: string;
};
export function wallTopologySignature(floor: Floor) {
  return JSON.stringify(
    floor.walls
      .map((w) => [w.id, w.start, w.end, w.verification === "REJECTED"])
      .sort((a, b) => compare(String(a[0]), String(b[0]))),
  );
}
function ordered(edges: SpaceBoundaryEdge[]): SpaceCandidate {
  let result = edges;
  if (signedArea(result.map((e) => e.start)) < 0)
    result = result
      .toReversed()
      .map((e) => ({ ...e, start: e.end, end: e.start }));
  let first = 0;
  for (let i = 1; i < result.length; i++) {
    const a = result[i].start,
      b = result[first].start;
    if (a.x < b.x || (a.x === b.x && a.y < b.y)) first = i;
  }
  result = [...result.slice(first), ...result.slice(0, first)].map(
    (e, index) => ({ ...e, index }),
  );
  const boundary = result.map((e) => e.start),
    opens = result.filter((e) => e.kind === "OPEN");
  // A missing run along a wall line is a partial opening. A whole open mouth is OPEN.
  const gap =
    opens.length &&
    opens.every((e) => {
      const i = result.indexOf(e),
        before = result[(i - 1 + result.length) % result.length],
        after = result[(i + 1) % result.length];
      return (
        Math.abs(cross(e.start, e.end, before.start)) < eps &&
        Math.abs(cross(e.start, e.end, after.end)) < eps
      );
    });
  return {
    boundary,
    boundaryEdges: result,
    boundaryWallIds: [
      ...new Set(result.flatMap((e) => (e.wallId ? [e.wallId] : []))),
    ].sort(compare),
    area: area(boundary),
    enclosureStatus: !opens.length ? "CLOSED" : gap ? "PARTIALLY_OPEN" : "OPEN",
  };
}
type Segment = { start: Point; end: Point; wallId: string };
/** Read-only noding: graph segments reference real floor-owned walls, never synthetic Walls. */
function segments(floor: Floor): Segment[] {
  const walls = floor.walls
    .filter((w) => w.verification !== "REJECTED")
    .toSorted((a, b) => compare(a.id, b.id));
  const cuts = walls.map((w) => [
    { t: 0, p: w.start },
    { t: 1, p: w.end },
  ]);
  for (let i = 0; i < walls.length; i++)
    for (let j = i + 1; j < walls.length; j++) {
      const a = walls[i],
        b = walls[j],
        ax = a.end.x - a.start.x,
        ay = a.end.y - a.start.y,
        bx = b.end.x - b.start.x,
        by = b.end.y - b.start.y;
      const den = ax * by - ay * bx;
      if (Math.abs(den) < eps) continue; // overlaps are rejected by wall validation
      const dx = b.start.x - a.start.x,
        dy = b.start.y - a.start.y;
      const t = (dx * by - dy * bx) / den,
        u = (dx * ay - dy * ax) / den;
      if (t < 0 || t > 1 || u < 0 || u > 1) continue;
      const p =
        t === 0
          ? a.start
          : t === 1
            ? a.end
            : u === 0
              ? b.start
              : u === 1
                ? b.end
                : { x: a.start.x + t * ax, y: a.start.y + t * ay };
      cuts[i].push({ t, p });
      cuts[j].push({ t: u, p });
    }
  return walls
    .flatMap((w, i) => {
      const points = cuts[i]
        .sort((a, b) => a.t - b.t)
        .filter((v, n, a) => !n || distance(v.p, a[n - 1].p) > eps);
      return points
        .slice(1)
        .map((v, n) => ({ start: points[n].p, end: v.p, wallId: w.id }));
    })
    .filter((s) => distance(s.start, s.end) > eps);
}
/** Bounded planar faces plus conservative single-mouth open chains. No canonical wall mutation. */
export function deriveSpacesFromWalls(floor: Floor): SpaceCandidate[] {
  const lines = segments(floor);
  type Edge = {
    from: Point;
    to: Point;
    line: number;
    reverse: number;
    index: number;
  };
  const edges: Edge[] = [],
    graph = new Map<string, number[]>();
  for (const [line, s] of lines.entries()) {
    const index = edges.length;
    edges.push(
      { from: s.start, to: s.end, line, reverse: index + 1, index },
      { from: s.end, to: s.start, line, reverse: index, index: index + 1 },
    );
  }
  for (const e of edges)
    graph.set(key(e.from), [...(graph.get(key(e.from)) ?? []), e.index]);
  for (const list of graph.values())
    list.sort((a, b) => {
      const x = edges[a],
        y = edges[b];
      return (
        Math.atan2(x.to.y - x.from.y, x.to.x - x.from.x) -
          Math.atan2(y.to.y - y.from.y, y.to.x - y.from.x) || a - b
      );
    });
  const seen = new Set<number>(),
    candidates: SpaceCandidate[] = [];
  for (const first of edges) {
    if (seen.has(first.index)) continue;
    const walk: Edge[] = [];
    let edge = first;
    while (!seen.has(edge.index)) {
      seen.add(edge.index);
      walk.push(edge);
      const exits = graph.get(key(edge.to))!;
      edge =
        edges[
          exits[(exits.indexOf(edge.reverse) - 1 + exits.length) % exits.length]
        ];
    }
    // Remove dangling excursions from a face walk, including across its starting point.
    let changed = true;
    while (changed && walk.length > 2) {
      changed = false;
      for (let i = 0; i < walk.length; i++)
        if (walk[i].reverse === walk[(i + 1) % walk.length].index) {
          if (i === walk.length - 1) {
            walk.pop();
            walk.shift();
          } else walk.splice(i, 2);
          changed = true;
          break;
        }
    }
    const boundary = walk.map((e) => e.from);
    if (
      walk.length >= 3 &&
      signedArea(boundary) > eps &&
      simplePolygon(boundary)
    )
      candidates.push(
        ordered(
          walk.map((e, index) => ({
            index,
            kind: "WALL",
            wallId: lines[e.line].wallId,
            start: e.from,
            end: e.to,
          })),
        ),
      );
  }
  // A non-branching component with exactly two loose ends has one explicit opening.
  const nodes = new Set<string>();
  for (const node of [...graph.keys()].sort(compare)) {
    if (nodes.has(node)) continue;
    const component: string[] = [],
      stack = [node];
    while (stack.length) {
      const n = stack.pop()!;
      if (nodes.has(n)) continue;
      nodes.add(n);
      component.push(n);
      for (const i of graph.get(n)!) stack.push(key(edges[i].to));
    }
    const ends = component
      .filter((n) => graph.get(n)!.length === 1)
      .sort(compare);
    if (ends.length !== 2 || component.some((n) => graph.get(n)!.length > 2))
      continue;
    let edge = edges[graph.get(ends[0])![0]];
    const chain: SpaceBoundaryEdge[] = [];
    for (;;) {
      chain.push({
        index: chain.length,
        kind: "WALL",
        wallId: lines[edge.line].wallId,
        start: edge.from,
        end: edge.to,
      });
      const next = graph.get(key(edge.to))!.filter((i) => i !== edge.reverse);
      if (!next.length) break;
      edge = edges[next[0]];
    }
    if (chain.length < 3) continue;
    const start = chain.at(-1)!.end,
      end = chain[0].start;
    chain.push({ index: chain.length, kind: "OPEN", wallId: null, start, end });
    const boundary = chain.map((e) => e.start);
    // Reject a virtual perimeter that crosses walls, self intersects or contains another region.
    if (!simplePolygon(boundary)) continue;
    if (
      lines.some(
        (s) =>
          !chain.some((e) => e.wallId === s.wallId) &&
          intersects(start, end, s.start, s.end),
      )
    )
      continue;
    candidates.push(ordered(chain));
  }
  return candidates.sort((a, b) =>
    compare(JSON.stringify(a.boundary), JSON.stringify(b.boundary)),
  );
}

/** Ear clipping plus convex clipping gives overlap area for concave simple polygons. */
function triangles(polygon: Point[]): Point[][] {
  const p = signedArea(polygon) < 0 ? polygon.toReversed() : [...polygon],
    result: Point[][] = [];
  // Collinear graph nodes are not polygon corners.
  for (let i = p.length - 1; i >= 0 && p.length > 3; i--)
    if (
      Math.abs(
        cross(p[(i - 1 + p.length) % p.length], p[i], p[(i + 1) % p.length]),
      ) < eps
    )
      p.splice(i, 1);
  while (p.length > 3) {
    let found = false;
    for (let i = 0; i < p.length; i++) {
      const a = p[(i - 1 + p.length) % p.length],
        b = p[i],
        c = p[(i + 1) % p.length];
      if (cross(a, b, c) <= eps) continue;
      if (
        p.some(
          (v) =>
            v !== a &&
            v !== b &&
            v !== c &&
            cross(a, b, v) >= -eps &&
            cross(b, c, v) >= -eps &&
            cross(c, a, v) >= -eps,
        )
      )
        continue;
      result.push([a, b, c]);
      p.splice(i, 1);
      found = true;
      break;
    }
    if (!found) return [];
  }
  if (p.length === 3) result.push(p);
  return result;
}
export function polygonOverlap(a: Point[], b: Point[]): number {
  let total = 0;
  for (const ta of triangles(a))
    for (const tb of triangles(b)) {
      let out = ta;
      for (let i = 0; i < 3 && out.length; i++) {
        const c = tb[i],
          d = tb[(i + 1) % 3],
          input = out;
        out = [];
        for (let j = 0; j < input.length; j++) {
          const p = input[j],
            q = input[(j + 1) % input.length],
            cp = cross(c, d, p),
            cq = cross(c, d, q);
          if (cp >= 0) out.push(p);
          if (cp >= 0 !== cq >= 0) {
            const t = cp / (cp - cq);
            out.push({ x: p.x + t * (q.x - p.x), y: p.y + t * (q.y - p.y) });
          }
        }
      }
      if (out.length >= 3) total += area(out);
    }
  return total;
}
function stableId(input: string) {
  const parts = [2166136261, 2246822507, 3266489909, 668265263]
    .map((seed) => {
      let h = seed;
      for (let i = 0; i < input.length; i++)
        h = Math.imul(h ^ input.charCodeAt(i), 16777619) >>> 0;
      return h.toString(16).padStart(8, "0");
    })
    .join("");
  return `${parts.slice(0, 8)}-${parts.slice(8, 12)}-5${parts.slice(13, 16)}-8${parts.slice(17, 20)}-${parts.slice(20, 32)}`;
}
function shapeKey(boundary: Point[]) {
  const p = [...boundary];
  for (let i = p.length - 1; i >= 0 && p.length > 3; i--)
    if (
      Math.abs(
        cross(p[(i - 1 + p.length) % p.length], p[i], p[(i + 1) % p.length]),
      ) < eps
    )
      p.splice(i, 1);
  if (!p.length) return "[]";
  if (signedArea(p) < 0) p.reverse();
  let first = 0;
  for (let i = 1; i < p.length; i++)
    if (p[i].x < p[first].x || (p[i].x === p[first].x && p[i].y < p[first].y))
      first = i;
  return JSON.stringify([...p.slice(first), ...p.slice(0, first)]);
}
const geometryEqual = (room: Room, c: SpaceCandidate) =>
  shapeKey(room.boundary) === shapeKey(c.boundary) &&
  (!room.enclosureStatus || room.enclosureStatus === c.enclosureStatus);

/** Geometry identity first; proposed metadata is never used as topology input. */
export function reconcileSpaces(
  floor: Floor,
  previous: Floor = floor,
): { floor: Floor; issues: SpaceIssue[] } {
  const candidates = deriveSpacesFromWalls(floor),
    issues: SpaceIssue[] = [],
    old = previous.rooms.filter((r) => r.verification !== "REJECTED");
  const scores = old
    .flatMap((r) =>
      candidates.map((c, index) => ({
        r,
        c,
        index,
        overlap: polygonOverlap(r.boundary, c.boundary),
        walls: (c.boundaryWallIds ?? []).filter((id) =>
          r.boundaryWallIds?.includes(id),
        ).length,
      })),
    )
    .filter((s) => s.overlap > eps)
    .sort(
      (a, b) =>
        b.overlap - a.overlap ||
        b.walls - a.walls ||
        compare(a.r.id, b.r.id) ||
        a.index - b.index,
    );
  const assigned = new Map<number, Room>(),
    used = new Set<string>();
  for (const s of scores)
    if (!assigned.has(s.index) && !used.has(s.r.id)) {
      assigned.set(s.index, s.r);
      used.add(s.r.id);
    }
  // Accept draft-only identities only for independently reproduced geometry.
  for (const [i, c] of candidates.entries())
    if (!assigned.has(i)) {
      const draft = floor.rooms
        .filter(
          (r) =>
            !old.some((o) => o.id === r.id) &&
            !used.has(r.id) &&
            geometryEqual(r, c),
        )
        .sort((a, b) => compare(a.id, b.id))[0];
      if (draft) {
        assigned.set(i, draft);
        used.add(draft.id);
      }
    }
  const reserved = new Set([...old, ...floor.rooms].map((r) => r.id));
  const rooms = candidates.map((c, index): Room => {
    const before = assigned.get(index),
      proposed = before && floor.rooms.find((r) => r.id === before.id);
    if (before && spaceGeometryProtected(before) && !geometryEqual(before, c)) {
      issues.push({
        entityId: before.id,
        code: "SPACE_GEOMETRY_CONFLICT",
        severity: "error",
        message: "Wall changes conflict with protected Space geometry.",
      });
      return clone(before);
    }
    const sameWalls =
      wallTopologySignature(floor) === wallTopologySignature(previous);
    if (
      before &&
      !before.topology &&
      geometryEqual(before, c) &&
      (spaceGeometryProtected(before) || sameWalls)
    )
      return clone(
        proposed
          ? {
              ...before,
              name: proposed.name,
              type: proposed.type,
              semantic: proposed.semantic,
              verification: proposed.verification,
              evidenceIds: proposed.evidenceIds,
              geometry:
                sameWalls && geometryEqual(proposed, c)
                  ? proposed.geometry
                  : before.geometry,
              floorElevation: proposed.floorElevation,
              ceilingElevation: proposed.ceilingElevation,
            }
          : before,
      );
    let id = before?.id ?? stableId(`${floor.id}:${JSON.stringify(c)}`),
      salt = 0;
    while (!before && reserved.has(id))
      id = stableId(`${floor.id}:${JSON.stringify(c)}:${++salt}`);
    reserved.add(id);
    const claim = {
      confidence: 1,
      verification: "DETECTED" as const,
      evidenceIds: [],
    };
    return {
      ...(before ?? {
        id,
        floorId: floor.id,
        kind: "room" as const,
        name: "Space",
        type: "unknown" as const,
        confidence: 1,
        verification: "DETECTED" as const,
        evidenceIds: [],
        semantic: {
          confidence: null,
          verification: "UNKNOWN" as const,
          evidenceIds: [],
        },
      }),
      ...(proposed
        ? {
            name: proposed.name,
            type: proposed.type,
            semantic: proposed.semantic,
            verification: proposed.verification,
            evidenceIds: proposed.evidenceIds,
          }
        : {}),
      floorElevation: proposed
        ? (proposed.floorElevation ?? null)
        : before
          ? (before.floorElevation ?? null)
          : 0,
      ceilingElevation: proposed
        ? (proposed.ceilingElevation ?? null)
        : (before?.ceilingElevation ?? null),
      ...c,
      boundarySource: "walls",
      geometry:
        before && spaceGeometryProtected(before) ? before.geometry : claim,
      topology: {
        source: "WALL_TOPOLOGY",
        engine: "space-topology-v1",
        wallSignature: wallTopologySignature(floor),
      },
    };
  });
  for (const r of old.filter((r) => !used.has(r.id))) {
    if (r.boundarySource === "manual") {
      const retained = floor.rooms.find((room) => room.id === r.id);
      if (retained) rooms.push(clone(retained));
      continue;
    }
    if (spaceGeometryProtected(r)) {
      issues.push({
        entityId: r.id,
        code: "SPACE_GEOMETRY_CONFLICT",
        severity: "error",
        message: "Wall changes would remove protected Space geometry.",
      });
      rooms.push(clone(r));
    } else if (!r.topology && r.boundarySource !== "walls")
      rooms.push(clone(r));
  }
  for (const r of floor.rooms)
    if (
      !r.topology &&
      r.boundarySource !== "walls" &&
      !old.some((o) => o.id === r.id) &&
      !rooms.some((o) => o.id === r.id)
    )
      rooms.push(clone(r));
  // Retain current entity ordering as well as identity; append new candidates deterministically.
  const roomOrder = new Map<string, number>();
  for (const r of [...previous.rooms, ...floor.rooms])
    if (!roomOrder.has(r.id)) roomOrder.set(r.id, roomOrder.size);
  rooms.sort(
    (a, b) =>
      (roomOrder.get(a.id) ?? Infinity) - (roomOrder.get(b.id) ?? Infinity),
  );
  const result = { ...clone(floor), rooms };
  const remaining = new Set(rooms.map((r) => r.id));
  for (const w of result.walls) {
    if (w.leftRoomId && !remaining.has(w.leftRoomId)) w.leftRoomId = null;
    if (w.rightRoomId && !remaining.has(w.rightRoomId)) w.rightRoomId = null;
  }
  for (const o of [...result.doors, ...result.openings, ...result.windows]) {
    if (o.fromRoomId && !remaining.has(o.fromRoomId)) o.fromRoomId = null;
    if (o.toRoomId && !remaining.has(o.toRoomId)) o.toRoomId = null;
  }
  for (const z of result.zones)
    z.roomIds = z.roomIds.filter((id) => remaining.has(id));
  deriveRoomConnections(result);
  return { floor: result, issues };
}
export function recomputeSceneSpaces(
  scene: HomeScene,
  previous: HomeScene,
  force = false,
): { scene: HomeScene; issues: SpaceIssue[] } {
  const issues: SpaceIssue[] = [],
    result = clone(scene);
  result.floors = result.floors.map((f) => {
    const old = previous.floors.find((p) => p.id === f.id);
    if (
      !force &&
      old &&
      wallTopologySignature(f) === wallTopologySignature(old) &&
      !f.rooms.some((r) => r.topology) &&
      !old.rooms.some((r) => r.topology)
    )
      return f;
    const next = reconcileSpaces(f, old ?? { ...f, rooms: [] });
    issues.push(...next.issues);
    return next.floor;
  });
  return { scene: result, issues };
}

/** Interior label point via best-first cell subdivision; presentation only. */
export function interiorLabelPoint(polygon: Point[]): Point {
  if (polygon.length < 3) return polygon[0] ?? { x: 0, y: 0 };
  const minX = Math.min(...polygon.map((p) => p.x)),
    maxX = Math.max(...polygon.map((p) => p.x)),
    minY = Math.min(...polygon.map((p) => p.y)),
    maxY = Math.max(...polygon.map((p) => p.y));
  const clearance = (p: Point) => {
    let d = Infinity;
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i],
        b = polygon[(i + 1) % polygon.length],
        dx = b.x - a.x,
        dy = b.y - a.y,
        t = Math.max(
          0,
          Math.min(
            1,
            ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy),
          ),
        );
      d = Math.min(d, distance(p, { x: a.x + t * dx, y: a.y + t * dy }));
    }
    return (pointInPolygon(p, polygon) ? 1 : -1) * d;
  };
  const cell = (x: number, y: number, h: number) => {
    const d = clearance({ x, y });
    return { x, y, h, d, max: d + h * Math.SQRT2 };
  };
  let best = cell((minX + maxX) / 2, (minY + maxY) / 2, 0);
  const queue = [cell(best.x, best.y, Math.max(maxX - minX, maxY - minY) / 2)];
  while (queue.length) {
    queue.sort((a, b) => b.max - a.max);
    const c = queue.shift()!;
    if (c.d > best.d) best = c;
    if (c.max - best.d <= 0.01) continue;
    const h = c.h / 2;
    queue.push(
      cell(c.x - h, c.y - h, h),
      cell(c.x + h, c.y - h, h),
      cell(c.x - h, c.y + h, h),
      cell(c.x + h, c.y + h, h),
    );
  }
  return { x: best.x, y: best.y };
}

export function validateSpaces(scene: HomeScene): SpaceIssue[] {
  const issues: SpaceIssue[] = [];
  const add = (
    r: Room,
    code: string,
    message: string,
    severity: "error" | "warning" = "error",
  ) => issues.push({ entityId: r.id, code, message, severity });
  for (const floor of scene.floors) {
    for (const r of floor.rooms) {
      if (r.verification === "REJECTED") continue;
      if (
        (r.floorElevation != null && !Number.isFinite(r.floorElevation)) ||
        (r.ceilingElevation != null && !Number.isFinite(r.ceilingElevation))
      )
        add(
          r,
          "SPACE_INVALID_ELEVATION",
          "Space elevations must be finite or unknown.",
        );
      if (
        r.floorElevation != null &&
        r.ceilingElevation != null &&
        r.ceilingElevation <= r.floorElevation
      )
        add(
          r,
          "SPACE_INVALID_CEILING",
          "Ceiling elevation must be above floor elevation.",
        );
      if (r.floorElevation == null || r.ceilingElevation == null)
        add(r, "SPACE_UNKNOWN_HEIGHT", "Clear height is unknown.", "warning");
      if (r.floorId !== floor.id)
        add(r, "SPACE_FLOOR_MISMATCH", "Space belongs to another floor.");
      if (!r.boundary.length) {
        if (r.enclosureStatus !== "OPEN" || r.area !== null)
          add(
            r,
            "SPACE_ZERO_AREA",
            "An indeterminate perimeter must be OPEN with unknown area.",
          );
      } else if (!simplePolygon(r.boundary))
        add(
          r,
          area(r.boundary) <= eps
            ? "SPACE_ZERO_AREA"
            : "SPACE_BOUNDARY_SELF_INTERSECTION",
          "Space boundary must be a simple positive-area polygon.",
        );
      if (r.enclosureStatus && !r.boundaryEdges?.length)
        add(
          r,
          "SPACE_GEOMETRY_STALE",
          "Classified Spaces require explicit boundary edges.",
        );
      if (r.enclosureStatus === "OPEN")
        add(
          r,
          "SPACE_BOUNDARY_OPEN",
          "Space has an explicit open boundary.",
          "warning",
        );
      if (r.enclosureStatus === "PARTIALLY_OPEN")
        add(
          r,
          "SPACE_BOUNDARY_PARTIALLY_OPEN",
          "Space has an explicit partial opening.",
          "warning",
        );
      if (r.boundaryEdges) {
        const ids = [
          ...new Set(
            r.boundaryEdges.flatMap((e) => (e.wallId ? [e.wallId] : [])),
          ),
        ].sort(compare);
        if (
          JSON.stringify(ids) !==
          JSON.stringify([...(r.boundaryWallIds ?? [])].sort(compare))
        )
          add(
            r,
            "SPACE_GEOMETRY_STALE",
            "Boundary wall references disagree with the ordered edges.",
          );
        for (const [i, e] of r.boundaryEdges.entries()) {
          if (e.index !== i || distance(e.start, e.end) <= eps)
            add(
              r,
              "SPACE_GEOMETRY_STALE",
              "Boundary edges must be ordered and nondegenerate.",
            );
          if (
            r.boundary.length &&
            (r.boundary.length !== r.boundaryEdges.length ||
              distance(e.start, r.boundary[i] ?? e.end) > eps ||
              distance(e.end, r.boundary[(i + 1) % r.boundary.length]) > eps)
          )
            add(
              r,
              "SPACE_GEOMETRY_STALE",
              "Boundary edges disagree with the perimeter.",
            );
          if (e.kind === "WALL") {
            const w = floor.walls.find(
              (w) => w.id === e.wallId && w.verification !== "REJECTED",
            );
            if (!w) {
              add(
                r,
                "SPACE_FLOOR_MISMATCH",
                "Boundary references a missing or foreign-floor wall.",
              );
              continue;
            }
            const len = distance(w.start, w.end),
              on = (p: Point) =>
                Math.abs(cross(w.start, w.end, p)) <= eps * Math.max(1, len) &&
                distance(w.start, p) + distance(p, w.end) <= len + eps;
            if (!on(e.start) || !on(e.end))
              add(
                r,
                "SPACE_GEOMETRY_STALE",
                "Boundary no longer follows its wall.",
              );
          }
        }
        if (
          r.boundary.length &&
          ordered(r.boundaryEdges).enclosureStatus !== r.enclosureStatus
        )
          add(
            r,
            "SPACE_GEOMETRY_STALE",
            "Enclosure status disagrees with the explicit perimeter.",
          );
      }
      if (
        r.topology &&
        r.topology.wallSignature !== wallTopologySignature(floor)
      )
        add(r, "SPACE_GEOMETRY_STALE", "Space topology needs recomputation.");
    }
    const rooms = floor.rooms.filter(
      (r) => r.verification !== "REJECTED" && simplePolygon(r.boundary),
    );
    for (let i = 0; i < rooms.length; i++)
      for (let j = i + 1; j < rooms.length; j++) {
        const a = rooms[i],
          b = rooms[j],
          overlap = polygonOverlap(a.boundary, b.boundary);
        if (overlap > eps)
          add(
            b,
            Math.abs(overlap - area(a.boundary)) < eps &&
              Math.abs(overlap - area(b.boundary)) < eps
              ? "SPACE_DUPLICATE_REGION"
              : "SPACE_OVERLAP",
            `Space overlaps ${a.name}.`,
          );
      }
  }
  return issues;
}
