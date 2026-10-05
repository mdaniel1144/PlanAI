import { expect, it } from "vitest";
import { Box3, Vector3 } from "three";
import { fitCameraToObject } from "../frontend/src/features/items/thumbnail-camera";
import { modelTransform } from "../frontend/src/features/items/model-transform";
import type { ItemAsset } from "@habitat/domain";
it.each([
  [12, 1, 1],
  [0.7, 8, 0.4],
  [0.45, 1.1, 0.5],
  [3, 0.8, 2],
  [0.9, 2.1, 0.04],
  [0.001, 0.002, 0.001],
])("fits all corners with padding for dimensions %s/%s/%s", (w, h, d) => {
  const bounds = new Box3(
    new Vector3(-w / 2, 0, -d / 2),
    new Vector3(w / 2, h, d / 2),
  );
  for (const aspect of [1, 0.5, 2]) {
    const camera = fitCameraToObject(bounds, aspect);
    for (const x of [-w / 2, w / 2])
      for (const y of [0, h])
        for (const z of [-d / 2, d / 2]) {
          const p = new Vector3(x, y, z).project(camera);
          expect(Math.abs(p.x)).toBeLessThanOrEqual(1 / 1.15 + 1e-9);
          expect(Math.abs(p.y)).toBeLessThanOrEqual(1 / 1.15 + 1e-9);
          expect(p.z).toBeGreaterThan(-1);
          expect(p.z).toBeLessThan(1);
        }
    const center = bounds.getCenter(new Vector3()).project(camera);
    expect(center.x).toBeCloseTo(0);
    expect(center.y).toBeCloseTo(0);
  }
});
it("rejects invalid bounds and shares the bottom-center uniform transform", () => {
  expect(() => fitCameraToObject(new Box3())).toThrow();
  const asset = {
    inspection: { bounds: { min: [2, 3, 4], max: [4, 7, 8] } },
    calibration: { metresPerModelUnit: 0.01, orientation: 90 },
  } as ItemAsset;
  expect(modelTransform(asset)).toEqual({
    scale: 0.01,
    rotation: Math.PI / 2,
    anchor: [-3, -3, -6],
  });
});
