export * from "./windows";
export * from "./window-placement";
import { validateWindows } from "./windows";
export * from "./core";
export * from "./spaces";
import {
  sceneSchema,
  clearHeight,
  type HomeScene,
  type Floor,
} from "@habitat/domain";
import { validateBaseScene, projectBaseFloor, area } from "./core";
import { validateSpaces, interiorLabelPoint } from "./spaces";
export function validateScene(scene: HomeScene) {
  return [
    ...validateBaseScene(scene),
    ...validateSpaces(scene),
    ...validateWindows(scene),
  ];
}
export function assertScene(input: unknown): HomeScene {
  const scene = sceneSchema.parse(input),
    errors = validateScene(scene).filter((i) => i.severity === "error");
  if (errors.length) throw new Error(errors.map((i) => i.message).join("; "));
  return scene;
}
export function projectFloor(floor: Floor) {
  const p = projectBaseFloor(floor);
  return {
    ...p,
    rooms: p.rooms.map((r) => ({
      ...r,
      computedArea: r.boundary.length ? area(r.boundary) : null,
      center: interiorLabelPoint(r.boundary),
      floorElevation: r.floorElevation ?? null,
      ceilingElevation: r.ceilingElevation ?? null,
      clearHeight: clearHeight(r),
    })),
  };
}
