import { newWindowAssembly, type Window } from "@habitat/domain";
import { uuid } from "@habitat/domain/fixture";
import { chain } from "./space-fixtures";
export function windowScene() {
  const scene = chain([
      [0, 0],
      [8, 0],
    ]),
    f = scene.floors[0];
  const window: Window = {
    id: uuid(6000),
    floorId: f.id,
    kind: "window",
    name: "Window",
    type: "sliding",
    wallId: f.walls[0].id,
    positionAlongWall: 1,
    positionReference: "OPENING_START",
    width: 2.4,
    verticalReference: "WORLD",
    bottomElevation: 0.9,
    topElevation: 2.4,
    height: null,
    sillHeight: null,
    fromRoomId: null,
    toRoomId: null,
    confidence: null,
    verification: "USER_CORRECTED",
    evidenceIds: [],
    assembly: newWindowAssembly(uuid(6100)),
  };
  const a = window.assembly!;
  a.profile = {
    material: "ALUMINUM",
    frameFaceWidth: 0.05,
    frameDepth: 0.08,
    sashFaceWidth: 0.025,
    sashDepth: 0.04,
  };
  a.panels = [0, 1, 2].map((index) => ({
    ...a.panels![0],
    id: uuid(6100 + index),
    index,
    region: { x: index / 3, y: 0, width: 1 / 3, height: 1 },
    function: index === 0 ? "FIXED" : "OPERABLE",
    operation: index === 0 ? "FIXED" : "SLIDING",
    slideDirection: index === 0 ? null : "TOWARD_PANEL_START",
  }));
  a.tracks = 2;
  a.glazing = {
    glazingType: "DOUBLE",
    glassFinish: "CLEAR",
    glassThickness: 0.006,
    overallGlazingThickness: 0.024,
  };
  a.panels[0].glazing = { ...a.glazing, glassFinish: "FROSTED" };
  a.shutter = { type: "ROLLER", operation: "ELECTRIC", boxType: "CONCEALED" };
  a.screen = { type: "SLIDING" };
  f.windows.push(window);
  return scene;
}
