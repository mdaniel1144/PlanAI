import {
  sceneSchema,
  type HomeScene,
  type Room,
  type Wall,
  type Door,
  type Window,
  type Project,
} from "./index";
export const uuid = (n: number) =>
  `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
export const DEMO_PROJECT_ID = uuid(1),
  DEMO_SCENE_ID = uuid(2),
  FLOOR_ID = uuid(3);
const evidenceId = uuid(4);
const claim = {
  confidence: null,
  verification: "VERIFIED" as const,
  evidenceIds: [evidenceId],
};
const rect = (x: number, y: number, w: number, h: number) => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];
export const demoProject: Project = {
  ownerUserId: null,
  id: DEMO_PROJECT_ID,
  name: "Courtyard residence",
  description:
    "A complete, authored residential floor. Deterministic demonstration data, not an analyzed plan.",
  units: "m",
  createdAt: "2026-01-15T10:00:00.000Z",
  isDemo: true,
};
export function createFixture(): HomeScene {
  const specs: [string, Room["type"], number, number, number, number][] = [
    ["Living room", "living_room", 0, 5.5, 7, 4.5],
    ["Kitchen", "kitchen", 7, 5.5, 5, 4.5],
    ["Bedroom 1", "bedroom", 0, 0, 4, 4],
    ["Bedroom 2", "bedroom", 4, 0, 4, 4],
    ["Bathroom", "bathroom", 8, 0, 4, 4],
    ["Hallway", "hallway", 0, 4, 12, 1.5],
    ["Balcony", "balcony", 0, 10, 7, 2],
  ];
  const rooms: Room[] = specs.map(([name, type, x, y, w, h], i) => ({
    id: uuid(10 + i),
    floorId: FLOOR_ID,
    kind: "room",
    floorElevation: null,
    ceilingElevation: null,
    name,
    type,
    boundary: rect(x, y, w, h),
    area: w * h,
    ...claim,
    semantic: { ...claim },
    geometry: { ...claim },
  }));
  const walls: Wall[] = [];
  const wall = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    a: number | null,
    b: number | null,
  ) => {
    const w: Wall = {
      id: uuid(100 + walls.length),
      floorId: FLOOR_ID,
      kind: "wall",
      name: `W-${101 + walls.length}`,
      type: a === null || b === null ? "exterior" : "interior",
      start: { x: x1, y: y1 },
      end: { x: x2, y: y2 },
      thickness: a === null || b === null ? 0.24 : 0.16,
      height: 2.8,
      base: 0,
      connectedWallIds: [],
      leftRoomId: a === null ? null : rooms[a].id,
      rightRoomId: b === null ? null : rooms[b].id,
      ...claim,
    };
    walls.push(w);
    return w;
  };
  // Left/right room fields refer to the signed side of each directed wall.
  const top = [
    wall(0, 0, 4, 0, 2, null),
    wall(4, 0, 8, 0, 3, null),
    wall(8, 0, 12, 0, 4, null),
  ];
  wall(0, 0, 0, 4, null, 2);
  wall(0, 4, 0, 5.5, null, 5);
  wall(0, 5.5, 0, 10, null, 0);
  wall(12, 0, 12, 4, 4, null);
  wall(12, 4, 12, 5.5, 5, null);
  wall(12, 5.5, 12, 10, 1, null);
  wall(4, 0, 4, 4, 2, 3);
  wall(8, 0, 8, 4, 3, 4);
  const bedroom1 = wall(0, 4, 4, 4, 5, 2),
    bedroom2 = wall(4, 4, 8, 4, 5, 3),
    bathroom = wall(8, 4, 12, 4, 5, 4);
  const living = wall(0, 5.5, 7, 5.5, 0, 5);
  wall(7, 5.5, 12, 5.5, 1, 5);
  const kitchen = wall(7, 5.5, 7, 10, 0, 1),
    balcony = wall(0, 10, 7, 10, 6, 0);
  const kitchenOuter = wall(7, 10, 12, 10, null, 1);
  wall(0, 10, 0, 12, null, 6);
  wall(7, 10, 7, 12, 6, null);
  wall(0, 12, 7, 12, null, 6);
  for (const w of walls)
    w.connectedWallIds = walls
      .filter(
        (v) =>
          v.id !== w.id &&
          [w.start, w.end].some((a) =>
            [v.start, v.end].some((b) => a.x === b.x && a.y === b.y),
          ),
      )
      .map((v) => v.id);
  const door = (
    w: Wall,
    p: number,
    a: number,
    b: number,
    i: number,
    sliding = false,
  ): Door => ({
    id: uuid(200 + i),
    floorId: FLOOR_ID,
    kind: "door",
    name: `D-${101 + i}`,
    wallId: w.id,
    positionAlongWall: p,
    width: sliding ? 2.4 : 0.9,
    height: 2.1,
    sillHeight: 0,
    type: sliding ? "sliding" : "hinged",
    direction: sliding ? "unknown" : "left",
    fromRoomId: rooms[a].id,
    toRoomId: rooms[b].id,
    ...claim,
  });
  const doors = [
    door(bedroom1, 3, 2, 5, 0),
    door(bedroom2, 3, 3, 5, 1),
    door(bathroom, 1, 4, 5, 2),
    door(living, 4.5, 5, 0, 3),
    door(kitchen, 2.3, 0, 1, 4),
    door(balcony, 3.5, 0, 6, 5, true),
  ];
  const windows: Window[] = [...top, kitchenOuter, walls[5]].map((w, i) => ({
    id: uuid(300 + i),
    floorId: FLOOR_ID,
    kind: "window",
    name: `WN-${101 + i}`,
    wallId: w.id,
    positionAlongWall: i === 4 ? 2.3 : 2,
    width: 1.8,
    height: 1.3,
    sillHeight: 0.9,
    type: "fixed",
    fromRoomId: null,
    toRoomId: null,
    ...claim,
  }));
  return sceneSchema.parse({
    schemaVersion: 1,
    id: DEMO_SCENE_ID,
    projectId: DEMO_PROJECT_ID,
    revision: 1,
    units: "m",
    evidence: [
      {
        id: evidenceId,

        type: "FIXTURE",
        description:
          "Authored residential test fixture v1. Dimensions are explicit synthetic inputs, not detected building facts.",
      },
    ],
    floors: [
      {
        id: FLOOR_ID,
        name: "Ground floor",
        elevation: 0,
        scale: {
          status: "VERIFIED",
          metersPerPixel: null,
          sourceOrigin: null,
          worldOrigin: null,
          rotation: null,
          evidenceIds: [evidenceId],
        },
        rooms,
        walls,
        doors,
        windows,
        openings: [],
        columns: [],
        stairs: [],
        shafts: [],
        dimensions: [
          {
            id: uuid(400),
            floorId: FLOOR_ID,
            kind: "dimension",
            name: "Overall width",
            start: { x: 0, y: 0 },
            end: { x: 12, y: 0 },
            value: 12,
            ...claim,
          },
          {
            id: uuid(401),
            floorId: FLOOR_ID,
            kind: "dimension",
            name: "Overall depth",
            start: { x: 0, y: 0 },
            end: { x: 0, y: 12 },
            value: 12,
            ...claim,
          },
        ],
        zones: [],
      },
    ],
  });
}
