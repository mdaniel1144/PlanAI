import type { ItemAsset } from "@habitat/domain";
import { loadModel, cloneModel } from "./model-cache";
import { calibratedModel, renderedModelBounds } from "./model-transform";
export async function measureCalibratedModel(asset: ItemAsset) {
  const instance = cloneModel(await loadModel(asset.id));
  try {
    return renderedModelBounds(calibratedModel(instance.scene, asset));
  } finally {
    instance.dispose();
  }
}
