import { describe, expect, it } from "vitest";
import { authenticatedAgent } from "./auth-helper";
import { createFixture } from "@habitat/domain/fixture";
import { sceneSchema, type Door } from "@habitat/domain";
import { saveSceneRequest } from "@habitat/contracts";
import {
  doorSwing,
  flipHinge,
  flipSwing,
  openingInterval,
  projectFloor,
  reverseWall,
  validateScene,
} from "@habitat/geometry";
import { createApp } from "../server/src/app";

const orientations = ["OPENING_START", "OPENING_END"] as const;
const sides = ["WALL_LEFT", "WALL_RIGHT"] as const;
function sample() {
  const scene = createFixture(),
    floor = scene.floors[0],
    door = floor.doors.find((d) => d.type === "hinged")!;
  const wall = floor.walls.find((w) => w.id === door.wallId)!;
  door.hingedOrientation = {
    hingeEndpoint: "OPENING_START",
    swingSide: "WALL_LEFT",
  };
  return { scene, floor, door, wall };
}
describe("canonical hinged envelope", () => {
  for (const end of [
    { x: 6, y: 0 },
    { x: 0, y: 6 },
    { x: 3.6, y: 4.8 },
  ])
    for (const hingeEndpoint of orientations)
      for (const swingSide of sides)
        it(`${JSON.stringify(end)} ${hingeEndpoint} ${swingSide}`, () => {
          const { wall, door } = sample();
          wall.start = { x: 0, y: 0 };
          wall.end = end;
          door.positionReference = "OPENING_START";
          door.positionAlongWall = 2;
          door.width = 1;
          door.hingedOrientation = { hingeEndpoint, swingSide };
          const swing = doorSwing(wall, door)!;
          const hingeDistance = hingeEndpoint === "OPENING_START" ? 2 : 3;
          expect(swing.hinge.x).toBeCloseTo((end.x / 6) * hingeDistance);
          expect(swing.hinge.y).toBeCloseTo((end.y / 6) * hingeDistance);
          const side = swingSide === "WALL_LEFT" ? 1 : -1;
          expect(swing.leafTip.x - swing.hinge.x).toBeCloseTo(
            (-end.y / 6) * side,
          );
          expect(swing.leafTip.y - swing.hinge.y).toBeCloseTo(
            (end.x / 6) * side,
          );
          expect(flipHinge(flipHinge(door))).toEqual(door);
          expect(flipSwing(flipSwing(door))).toEqual(door);
        });
  it("keeps legacy doors unchanged and renders no invented orientation", () => {
    const scene = createFixture();
    expect(sceneSchema.parse(scene)).toEqual(scene);
    const f = scene.floors[0];
    for (const d of f.doors) {
      expect(d).not.toHaveProperty("hingedOrientation");
      expect(
        doorSwing(
          f.walls.find((w) => w.id === d.wallId)!,
          d,
        ),
      ).toBeNull();
    }
    const { door, wall, scene: s } = sample();
    door.type = "sliding";
    expect(doorSwing(wall, door)).toBeNull();
    expect(
      validateScene(s).some((i) => i.message.includes("Only hinged")),
    ).toBe(true);
    delete door.hingedOrientation;
    expect(validateScene(s).filter((i) => i.severity === "error")).toEqual([]);
  });
  it("preserves placement under movement, rejects shortening, and never normalizes wall direction", () => {
    const { floor, door, wall, scene } = sample(),
      before = doorSwing(wall, door)!;
    const position = door.positionAlongWall;
    wall.start.x += 2;
    wall.end.x += 2;
    expect(doorSwing(wall, door)!.hinge.x).toBeCloseTo(before.hinge.x + 2);
    expect(door.positionAlongWall).toBe(position);
    const original = structuredClone(floor);
    projectFloor(floor);
    sceneSchema.parse(scene);
    validateScene(scene);
    expect(floor).toEqual(original);
    const reversed = reverseWall(floor, wall.id);
    const swing = doorSwing(
      reversed.walls.find((w) => w.id === wall.id)!,
      reversed.doors.find((d) => d.id === door.id)!,
    )!;
    expect(swing.hinge.x).toBeCloseTo(before.hinge.x + 2);
    expect(swing.hinge.y).toBeCloseTo(before.hinge.y);
    expect(swing.leafTip.y).toBeCloseTo(before.leafTip.y);
    wall.end = { x: wall.start.x + 0.1, y: wall.start.y };
    expect(
      validateScene(scene).some(
        (i) => i.entityId === door.id && i.message.includes("beyond"),
      ),
    ).toBe(true);
    expect(door.positionAlongWall).toBe(position);
  });
  it("reverses start-referenced openings explicitly without moving the envelope", () => {
    const { floor, door, wall } = sample();
    door.positionAlongWall = openingInterval(door)!.start;
    door.positionReference = "OPENING_START";
    const before = doorSwing(wall, door)!;
    const f = reverseWall(floor, wall.id);
    const after = doorSwing(
      f.walls.find((w) => w.id === wall.id)!,
      f.doors.find((d) => d.id === door.id)!,
    )!;
    expect(after.hinge.x).toBeCloseTo(before.hinge.x);
    expect(after.hinge.y).toBeCloseTo(before.hinge.y);
    expect(after.leafTip.x).toBeCloseTo(before.leafTip.x);
    expect(after.leafTip.y).toBeCloseTo(before.leafTip.y);
  });
});
it("round-trips repository, API contract, current-state save and JSON; blocks stale writers", async () => {
  const instance = createApp(":memory:", "/tmp/habitat-door-tests");
  try {
    const agent = await authenticatedAgent(instance);
    const { scene, door } = sample();
    const body = saveSceneRequest.parse({
      scene,
      expectedRevision: 1,

      writerCapabilities: ["door-orientation-v1"],
    });
    const response = await agent
      .put(`/api/scenes/${scene.id}`)
      .send(body)
      .expect(200);
    const saved = instance.repo.scene(scene.id)!;
    const findDoor = (s: typeof scene): Door =>
      s.floors[0].doors.find((d) => d.id === door.id)!;
    expect(findDoor(saved).hingedOrientation).toEqual(door.hingedOrientation);
    expect(
      findDoor(sceneSchema.parse(response.body)).hingedOrientation,
    ).toEqual(door.hingedOrientation);
    // Same serialization used by downloadJson; exercise the parsed HTTP payload too.
    const exported = JSON.parse(
      JSON.stringify(sceneSchema.parse(response.body), null, 2),
    );
    expect(findDoor(exported).hingedOrientation).toEqual(
      door.hingedOrientation,
    );
    const stripped = structuredClone(saved);
    delete findDoor(stripped).hingedOrientation;
    await agent
      .put(`/api/scenes/${scene.id}`)
      .send({ scene: stripped, expectedRevision: 2 })
      .expect(409);
    expect(instance.repo.currentRevision(scene.id)).toBe(2);
    await agent
      .put(`/api/scenes/${scene.id}`)
      .send({ ...body, scene: saved, expectedRevision: 1 })
      .expect(409);
  } finally {
    instance.close();
  }
});

it("persists start-referenced placement and API corrections without losing legacy direction", async () => {
  const instance = createApp(":memory:", "/tmp/habitat-placement-tests");
  try {
    const agent = await authenticatedAgent(instance);
    const { scene, door } = sample();
    door.positionAlongWall = openingInterval(door)!.start;
    door.positionReference = "OPENING_START";
    const before = door.direction;
    const saved = instance.service.save(scene.id, scene, 1);
    expect(instance.repo.scene(scene.id)).toEqual(saved);
    const read = sceneSchema.parse(
      (await agent.get(`/api/scenes/${scene.id}`).expect(200))
        .body,
    );
    const persisted = read.floors[0].doors.find((d) => d.id === door.id)!;
    expect(persisted.positionReference).toBe("OPENING_START");
    expect(persisted.positionAlongWall).toBe(door.positionAlongWall);
    expect(openingInterval(persisted)).toEqual(openingInterval(door));
    const flipped = { hingeEndpoint: "OPENING_END", swingSide: "WALL_RIGHT" };
    const corrected = sceneSchema.parse(
      (
        await agent
          .post(`/api/scenes/${scene.id}/corrections`)
          .send({
            expectedRevision: 2,
            entityId: door.id,
            patch: { hingedOrientation: flipped },
          })
          .expect(201)
      ).body,
    );
    expect(
      corrected.floors[0].doors.find((d) => d.id === door.id)!.direction,
    ).toBe(before);
    expect(
      corrected.floors[0].doors.find((d) => d.id === door.id)!
        .hingedOrientation,
    ).toEqual(flipped);
    expect(instance.repo.scene(scene.id)).toEqual(corrected);
  } finally {
    instance.close();
  }
});
