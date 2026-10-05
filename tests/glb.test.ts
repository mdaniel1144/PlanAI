import { it, expect } from "vitest";
import { inspectGLB } from "../server/src/modules/items/glb";
import { testGLB } from "./glb-fixture";
import {
  loadModel,
  cloneModel,
  clearModelCache,
} from "../frontend/src/features/items/model-cache";
import type {
  Mesh,
  MeshStandardMaterial,
} from "../frontend/node_modules/@types/three";
it("inspects actual geometry and rejects external resources, invalid buffers and headers", async () => {
  const result = await inspectGLB(testGLB());
  expect(result.nodes).toHaveLength(2);
  expect(result.materials).toHaveLength(2);
  expect(result.dimensions.width).toBeCloseTo(2.4);
  expect(result.dimensions.height).toBeCloseTo(0.82);
  await expect(inspectGLB(Buffer.from("fake.glb"))).rejects.toThrow();
  await expect(
    inspectGLB(Buffer.alloc(50 * 1024 * 1024 + 1)),
  ).rejects.toMatchObject({ code: "ITEM_ASSET_TOO_LARGE" });
  const broken = testGLB();
  broken.writeUInt32LE(0xffffffff, 12);
  await expect(inspectGLB(broken)).rejects.toThrow();
  await expect(
    inspectGLB(
      testGLB((g) => {
        g.buffers = [
          { byteLength: 232, uri: "https://invalid.test/model.bin" },
        ];
      }),
    ),
  ).rejects.toMatchObject({ code: "ITEM_EXTERNAL_RESOURCE_UNSUPPORTED" });
  await expect(
    inspectGLB(
      testGLB((g) => {
        g.accessors = [
          { bufferView: 0, componentType: 5126, count: 100000, type: "VEC3" },
        ];
      }),
    ),
  ).rejects.toThrow();
});
it("loads one real GLB once and isolates two instances including material arrays", async () => {
  clearModelCache();
  let calls = 0;
  const bytes = testGLB();
  const fetcher = async () => {
    calls++;
    return bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;
  };
  const [source, same] = await Promise.all([
    loadModel("proof", fetcher),
    loadModel("proof", fetcher),
  ]);
  expect(source).toBe(same);
  expect(calls).toBe(1);
  const original = source.scene.getObjectByName("Fabric") as Mesh;
  const material = original.material as MeshStandardMaterial;
  original.material = [material, material];
  const a = cloneModel(source),
    b = cloneModel(source);
  const am = (a.scene.getObjectByName("Fabric") as Mesh)
      .material as MeshStandardMaterial[],
    bm = (b.scene.getObjectByName("Fabric") as Mesh)
      .material as MeshStandardMaterial[];
  am[0].color.set("#0000ff");
  expect(bm[0].color.getHexString()).toBe("ffffff");
  expect(material.color.getHexString()).toBe("ffffff");
  expect(am[1]).not.toBe(am[0]);
  expect((a.scene.getObjectByName("Fabric") as Mesh).geometry).toBe(
    original.geometry,
  );
  a.dispose();
  b.dispose();
  clearModelCache();
});
it("calibrates using uniform units and handles currency minor units exactly", async () => {
  const { calibratedDimensions, priceToMinor } =
    await import("@habitat/domain");
  const inspection = await inspectGLB(testGLB());
  const asset = {
    inspection,
    calibration: {
      metresPerModelUnit: 0.5,
      orientation: 90 as const,
      confirmed: true as const,
    },
  } as Parameters<typeof calibratedDimensions>[0];
  expect(calibratedDimensions(asset)?.width).toBeCloseTo(0.475);
  expect(calibratedDimensions(asset)?.depth).toBeCloseTo(1.2);
  expect(priceToMinor("6900.50", "ILS")).toBe(690050);
  expect(priceToMinor("6900", "JPY")).toBe(6900);
  expect(() => priceToMinor("1.01", "JPY")).toThrow();
});
it("evicts cached sources while retaining resources still used by a live instance", async () => {
  clearModelCache();
  const bytes = testGLB();
  const fetcher = async () =>
    bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;
  const source = await loadModel("live", fetcher),
    instance = cloneModel(source);
  const geometry = (source.scene.getObjectByName("Fabric") as Mesh).geometry;
  let disposed = 0;
  geometry.addEventListener("dispose", () => disposed++);
  for (let i = 0; i < 17; i++) await loadModel(`eviction-${i}`, fetcher);
  expect(disposed).toBe(0);
  instance.dispose();
  expect(disposed).toBe(1);
  clearModelCache();
});
it("maps two selected regions, preserves the fixed third, and isolates color changes from another instance", async () => {
  const { colorTargetGLB } = await import("./glb-fixture");
  const { applyVariant } =
    await import("../frontend/src/features/items/model-cache");
  const bytes = colorTargetGLB();
  const source = await loadModel(
    "targets-proof",
    async () =>
      bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer,
  );
  const a = cloneModel(source),
    b = cloneModel(source);
  const item = {
    baseModelAssetId: "targets-proof",
    bindings: [0, 1].map((index) => ({
      modelAssetId: "targets-proof",
      materialIndex: index,
      nodeIndex: index,
      slotId: "PRODUCT_COLOR",
    })),
    materials: [],
  } as unknown as import("@habitat/domain").Item;
  const color = (hex: string) =>
    ({
      overrides: [
        { slotId: "PRODUCT_COLOR", materialId: null, baseColor: hex },
      ],
    }) as import("@habitat/domain").ItemVariant;
  const colors = (instance: typeof a) =>
    ["Body", "Cushion", "Fixed_frame"].map((name) =>
      (
        (instance.scene.getObjectByName(name) as Mesh)
          .material as MeshStandardMaterial
      ).color.getHexString(),
    );
  await applyVariant(a, item, color("#0000ff"));
  await applyVariant(b, item, color("#ffffff"));
  expect(colors(a)).toEqual(["0000ff", "0000ff", "ffffff"]);
  expect(colors(b)).toEqual(["ffffff", "ffffff", "ffffff"]);
  await applyVariant(a, item, color("#00ff00"));
  expect(colors(a)).toEqual(["00ff00", "00ff00", "ffffff"]);
  expect(colors(b)).toEqual(["ffffff", "ffffff", "ffffff"]);
  a.dispose();
  b.dispose();
  clearModelCache();
});
