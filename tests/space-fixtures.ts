import { createFixture, uuid } from "@habitat/domain/fixture";
import type { HomeScene, Floor, Point, Wall } from "@habitat/domain";
import { reconcileSpaces, reconnectWalls } from "@habitat/geometry";
export function blankScene(): HomeScene {
  const scene = createFixture(),
    f = scene.floors[0];
  f.rooms = [];
  f.walls = [];
  f.doors = [];
  f.windows = [];
  f.openings = [];
  f.columns = [];
  f.stairs = [];
  f.shafts = [];
  f.dimensions = [];
  f.zones = [];
  return scene;
}
export function wall(f: Floor, a: Point, b: Point, n: number): Wall {
  return {
    id: uuid(1000 + n),
    floorId: f.id,
    kind: "wall",
    name: `Wall ${n}`,
    type: "interior",
    start: a,
    end: b,
    thickness: 0.2,
    height: 3,
    base: 0,
    connectedWallIds: [],
    leftRoomId: null,
    rightRoomId: null,
    verification: "USER_CORRECTED",
    confidence: null,
    evidenceIds: [],
  };
}
export function chain(points: number[][], close = false): HomeScene {
  const s = blankScene(),
    f = s.floors[0],
    p = points.map(([x, y]) => ({ x, y }));
  if (close) p.push(p[0]);
  f.walls = p.slice(1).map((b, i) => wall(f, p[i], b, i));
  reconnectWalls(f);
  return s;
}
export function rectangle() {
  return chain(
    [
      [0, 0],
      [8, 0],
      [8, 4],
      [0, 4],
    ],
    true,
  );
}
export function detected(s: HomeScene) {
  return { ...s, floors: s.floors.map((f) => reconcileSpaces(f).floor) };
}
export const spaceFixtures = {
  closed: rectangle,
  shared: () => {
    const s = rectangle(),
      f = s.floors[0];
    f.walls.push(wall(f, { x: 4, y: 0 }, { x: 4, y: 4 }, 10));
    return s;
  },
  lShape: () =>
    chain(
      [
        [0, 0],
        [6, 0],
        [6, 2],
        [2, 2],
        [2, 6],
        [0, 6],
      ],
      true,
    ),
  open: () =>
    chain([
      [0, 0],
      [0, 4],
      [8, 4],
      [8, 0],
    ]),
  partiallyOpen: () =>
    chain([
      [3, 0],
      [0, 0],
      [0, 4],
      [8, 4],
      [8, 0],
      [5, 0],
    ]),
  smallGap: () =>
    chain([
      [3, 0],
      [0, 0],
      [0, 4],
      [8, 4],
      [8, 0],
      [3.001, 0],
    ]),
  levels: () => {
    const s = detected(spaceFixtures.shared()),
      [a, b] = s.floors[0].rooms;
    a.floorElevation = 0;
    a.ceilingElevation = 3;
    b.floorElevation = 0.45;
    b.ceilingElevation = 3.2;
    return s;
  },
  bathroom: () => {
    const s = detected(rectangle());
    s.floors[0].rooms[0].floorElevation = -0.02;
    return s;
  },
};
