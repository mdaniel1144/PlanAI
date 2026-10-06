import { verifiedDimensions, dimensionAdmin } from "./dimension-fixture";
import { it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { openDatabase } from "../server/src/infrastructure/database/database";
import { CatalogService } from "../server/src/modules/items/service";
import { inspectGLB } from "../server/src/modules/items/glb";
import { testGLB } from "./glb-fixture";
import { projectItemInstanceSchema } from "@habitat/domain";
it("keeps real sizes in separate Items and lets three colors inherit price and product code", async () => {
  const { sqlite: db } = openDatabase(":memory:");
  const catalog = new CatalogService(db);
  try {
    db.prepare("INSERT INTO brands VALUES(?,?,1)").run("brand", "Example");
    async function product(width: number) {
      let item = catalog.saveItem({
        name: `Sofa X ${width * 100}`,
        brandId: "brand",
        categoryId: "sofa",
        itemCode: "SHARED-CODE",
        basePriceMinor: 690000,
      });
      const bytes = testGLB((g) => {
        for (const node of g.nodes as { scale?: number[] }[])
          node.scale = [
            ((node.scale?.[0] ?? 1) * width) / 2.4,
            node.scale?.[1] ?? 1,
            node.scale?.[2] ?? 1,
          ];
      });
      const modelId = randomUUID(),
        inspection = await inspectGLB(bytes);
      db.prepare("INSERT INTO item_assets VALUES(?,?,?,?,?,?,?,?,?,?,?)").run(
        modelId,
        item.id,
        "GLB_MODEL",
        randomUUID(),
        "model/gltf-binary",
        "sofa.glb",
        bytes.length,
        "test",
        JSON.stringify(inspection),
        null,
        "now",
      );
      item = catalog.calibrate(
        item.id,
        modelId,
        verifiedDimensions({
          width,
          depth: 0.95,
          height: 0.82,
          orientation: 0,
          confirmed: true,
        }),
        dimensionAdmin(catalog.db),
      );
      catalog.colorTargets(item.id, {
        targets: [{ materialIndex: 0, nodeIndex: 0 }],
      });
      for (const [name, baseColor] of [
        ["Blue", "#0000ff"],
        ["White", "#ffffff"],
        ["Green", "#00ff00"],
      ])
        item = catalog.saveColor(item.id, {
          name,
          baseColor,
          status: "ACTIVE",
        });
      return item;
    }
    const small = await product(2.2),
      large = await product(2.6);
    expect(small.id).not.toBe(large.id);
    expect(small.baseModelAssetId).not.toBe(large.baseModelAssetId);
    expect(small.width).toBe(2.2);
    expect(large.width).toBe(2.6);
    expect(small.colors).toHaveLength(3);
    const card = catalog.get(small.id, true);
    expect(card.colors).toHaveLength(3);
    expect(card.defaultColor?.id).toBe(small.defaultVariantId);
    expect(card.colors.every((color) => color.overrides.length === 0)).toBe(
      true,
    );
    expect(card.assets).toEqual([]);
    expect(card.materials).toEqual([]);
    expect(
      small.colors.every(
        (c) =>
          c.sku === null &&
          c.effectiveSku === "SHARED-CODE" &&
          c.priceMinor === 690000 &&
          c.modelAssetId === null,
      ),
    ).toBe(true);
    expect(
      db
        .prepare(
          "SELECT COUNT(*) AS n FROM item_variants WHERE model_asset_id IS NOT NULL",
        )
        .get(),
    ).toEqual({ n: 0 });
    const blue = small.colors.find((c) => c.name === "Blue")!;
    catalog.saveColor(small.id, { priceMinor: 700000, sku: "SOFA-B" }, blue.id);
    expect(
      catalog.get(small.id).colors.find((c) => c.id === blue.id)?.priceMinor,
    ).toBe(690000);
    catalog.saveItem({ samePriceForAllColors: false }, small.id);
    expect(
      catalog.get(small.id).colors.find((c) => c.id === blue.id)?.priceMinor,
    ).toBe(700000);
    expect(
      catalog
        .get(small.id)
        .colors.filter((c) => c.id !== blue.id)
        .every((c) => c.priceMinor === 690000),
    ).toBe(true);
    expect(() =>
      catalog.saveColor(large.id, { sku: "sofa-b" }, large.colors[0].id),
    ).toThrow("SKU already exists");
    catalog.saveItem({ basePriceMinor: 680000 }, small.id);
    expect(
      catalog.get(small.id).colors.find((c) => c.name === "White")?.priceMinor,
    ).toBe(680000);
    const before = catalog.get(small.id);
    catalog.saveColor(small.id, { baseColor: "#009900" }, blue.id);
    const after = catalog.get(small.id);
    expect(after.dimensions).toEqual(before.dimensions);
    expect(after.baseModelAssetId).toBe(before.baseModelAssetId);
    expect(after.assets).toEqual(before.assets);
    for (const input of [
      { width: 2.6 },
      { depth: 0.95 },
      { height: 0.82 },
      { modelAssetId: large.baseModelAssetId },
    ])
      expect(() => catalog.saveColor(small.id, input, blue.id)).toThrow();
    expect(
      projectItemInstanceSchema.safeParse({
        id: randomUUID(),
        floorId: randomUUID(),
        itemId: small.id,
        variantId: blue.id,
        positionX: 1,
        positionY: 1,
        rotation: 0,
        scaleX: 1.1,
      }).success,
    ).toBe(false);
    expect(db.pragma("foreign_key_check")).toEqual([]);
  } finally {
    db.close();
  }
});
