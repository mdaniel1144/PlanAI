import {
  ACESFilmicToneMapping,
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
} from "three";
import type { Item } from "@habitat/domain";
import { loadModel, cloneModel, applyVariant } from "./model-cache";
import { calibratedModel } from "./model-transform";
import { fitCameraToObject } from "./thumbnail-camera";
export const thumbnailSize = 512;
// Diagnostic counters also allow browser regression checks without keeping WebGL objects alive.
export const thumbnailResources = { active: 0, completed: 0 };
export async function generateItemThumbnail(
  item: Item,
  signal?: AbortSignal,
): Promise<Blob> {
  const asset = item.assets.find((a) => a.id === item.baseModelAssetId);
  if (!asset?.calibration || !item.setup?.dimensionsConfirmed)
    throw new Error("Confirm real dimensions first");
  signal?.throwIfAborted();
  const source = await loadModel(asset.id);
  signal?.throwIfAborted();
  const instance = cloneModel(source);
  let renderer: WebGLRenderer | undefined;
  thumbnailResources.active++;
  try {
    const color = item.colors.find(
      (c) => c.id === item.defaultVariantId && c.status === "ACTIVE",
    );
    if (color) await applyVariant(instance, item, color);
    signal?.throwIfAborted();
    const model = calibratedModel(instance.scene, asset);
    const scene = new Scene();
    scene.background = new Color("#eeeee8");
    scene.add(model);
    scene.add(new AmbientLight(0xffffff, 2));
    const key = new DirectionalLight(0xffffff, 3);
    key.position.set(4, 8, 5);
    scene.add(key);
    const fill = new DirectionalLight(0xffffff, 0.6);
    fill.position.set(-4, 3, -2);
    scene.add(fill);
    scene.updateMatrixWorld(true);
    const camera = fitCameraToObject(new Box3().setFromObject(model));
    renderer = new WebGLRenderer({
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
    });
    renderer.setPixelRatio(1);
    renderer.setSize(thumbnailSize, thumbnailSize, false);
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    await renderer.compileAsync(scene, camera);
    signal?.throwIfAborted();
    renderer.render(scene, camera);
    const canvas = renderer.domElement;
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) =>
          value ? resolve(value) : reject(new Error("Image export failed")),
        "image/webp",
        0.9,
      ),
    );
    signal?.throwIfAborted();
    if (!["image/webp", "image/png"].includes(blob.type))
      throw new Error("Unsupported image export");
    thumbnailResources.completed++;
    return blob;
  } finally {
    // Shared geometry and cached textures remain owned by their leases.
    instance.dispose();
    renderer?.dispose();
    renderer?.forceContextLoss();
    renderer?.domElement.remove();
    thumbnailResources.active--;
  }
}
