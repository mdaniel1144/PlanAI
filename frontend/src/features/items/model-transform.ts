import { Group, Box3, type Object3D } from "three";
import type { WorldBoundsMeters } from "@habitat/domain";
import type { ItemAsset } from "@habitat/domain";
// Shared by workspace/preview and capture: bottom-center anchor, one scalar, Y orientation.
export function modelTransform(asset: ItemAsset) {
  if (!asset.inspection) throw new Error("Model inspection is unavailable");
  const { min, max } = asset.inspection.bounds;
  return {
    scale: asset.calibration?.metresPerModelUnit ?? 1,
    rotation: ((asset.calibration?.orientation ?? 0) * Math.PI) / 180,
    anchor: [-(min[0] + max[0]) / 2, -min[1], -(min[2] + max[2]) / 2] as [
      number,
      number,
      number,
    ],
  };
}

export function calibratedModel(scene: Object3D, asset: ItemAsset) {
  const transform = modelTransform(asset),
    model = new Group(),
    anchor = new Group();
  anchor.position.set(...transform.anchor);
  anchor.add(scene);
  model.add(anchor);
  model.rotation.y = transform.rotation;
  model.scale.setScalar(transform.scale);
  model.updateMatrixWorld(true);
  return model;
}
export function renderedModelBounds(model: Object3D): WorldBoundsMeters {
  model.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(model, true);
  return { min: bounds.min.toArray(), max: bounds.max.toArray() };
}
