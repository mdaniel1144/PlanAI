import { verifiedDimensions, dimensionAdmin } from "./dimension-fixture";
import { afterEach, beforeEach, expect, it } from "vitest";
import { mkdtempSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { itemInput, simpleColorInput } from "@habitat/domain";
import { openDatabase } from "../server/src/infrastructure/database/database";
import { CatalogService } from "../server/src/modules/items/service";
import { AssetService } from "../server/src/modules/items/assets";
import { inspectGLB } from "../server/src/modules/items/glb";
import {
  ItemError,
  catalogValidationError,
} from "../server/src/modules/items/errors";
import { testGLB } from "./glb-fixture";
import {
  optionalId,
  optionalString,
  optionalNumber,
  moneyInput,
  normalizeCatalogForm,
} from "../frontend/src/features/items/forms";
let connection: ReturnType<typeof openDatabase>,
  c: CatalogService,
  a: AssetService,
  root: string;
beforeEach(() => {
  connection = openDatabase(":memory:");
  c = new CatalogService(connection.sqlite);
  root = mkdtempSync(join(tmpdir(), "setup-test-"));
  a = new AssetService(connection.sqlite, root);
  connection.sqlite
    .prepare("INSERT INTO brands VALUES('brand','Brand',1)")
    .run();
});
afterEach(() => {
  connection.sqlite.close();
  rmSync(root, { recursive: true, force: true });
});
const draft = () =>
  c.saveItem({ name: "Product", brandId: "brand", categoryId: "sofa" });
async function model(id: string) {
  const bytes = testGLB();
  return a.register(
    id,
    "GLB_MODEL",
    "product.glb",
    "model/gltf-binary",
    bytes,
    await inspectGLB(bytes),
  );
}
async function ready() {
  let item = draft();
  const id = await model(item.id);
  c.calibrate(
    item.id,
    id,
    verifiedDimensions({
      width: 2.4,
      depth: 0.95,
      height: 0.82,
      orientation: 0,
      confirmed: true,
    }),
    dimensionAdmin(c.db),
  );
  c.colorTargets(item.id, { targets: [{ materialIndex: 0, nodeIndex: 0 }] });
  c.saveColor(item.id, {
    name: "Blue",
    baseColor: "#0000ff",
    status: "ACTIVE",
  });
  a.register(
    item.id,
    "THUMBNAIL",
    "cover.png",
    "image/png",
    Buffer.from("fixture"),
  );
  item = c.saveItem({ basePriceMinor: 0 }, item.id);
  return item;
}
it("normalizes optional references and SKU without accepting invalid or foreign references", () => {
  let item = draft();
  item = c.saveItem(
    {
      defaultVariantId: "",
      thumbnailAssetId: " ",
      baseModelAssetId: "",
      itemCode: " ",
    },
    item.id,
  );
  expect(item.defaultVariantId).toBeNull();
  expect(item.setup?.nextRequiredStep).toBe("MODEL");
  expect(item.setup?.publishable).toBe(false);
  expect(
    simpleColorInput.partial().parse({ sku: "", textureAssetId: "" }),
  ).toMatchObject({ sku: null, textureAssetId: null });
  for (const field of [
    "defaultVariantId",
    "baseModelAssetId",
    "thumbnailAssetId",
  ]) {
    expect(() => c.saveItem({ [field]: randomUUID() }, item.id)).toThrow();
  }
  const bad = itemInput.safeParse({
    ...item,
    name: "Product",
    defaultVariantId: "not-a-reference",
  });
  expect(bad.success).toBe(false);
  if (!bad.success)
    expect(catalogValidationError(bad.error).error).not.toContain(
      "Invalid UUID",
    );
  expect(connection.sqlite.pragma("foreign_key_check")).toEqual([]);
});
it("provides every missing publication requirement while allowing draft saves", () => {
  const item = draft();
  expect(() => c.saveItem({ status: "DRAFT" }, item.id)).not.toThrow();
  try {
    c.saveItem({ status: "ACTIVE" }, item.id);
    throw new Error("published");
  } catch (error) {
    expect(error).toBeInstanceOf(ItemError);
    expect((error as ItemError).code).toBe("ITEM_NOT_PUBLISHABLE");
    expect((error as ItemError).blockingIssues?.map((i) => i.code)).toEqual(
      expect.arrayContaining([
        "ITEM_MODEL_MISSING",
        "ITEM_DIMENSIONS_UNCONFIRMED",
        "ITEM_COLOR_TARGET_MISSING",
        "ITEM_COLOR_INVALID",
        "ITEM_DEFAULT_COLOR_INVALID",
        "ITEM_PRICE_MISSING",
        "ITEM_THUMBNAIL_MISSING",
      ]),
    );
  }
  expect(c.get(item.id).status).toBe("DRAFT");
});
it("requires each publication component independently and validates foreign defaults", async () => {
  const item = await ready();
  expect(item.setup?.publishable).toBe(true);
  const checks = [
    { assets: [] },
    { width: null },
    { bindings: [] },
    { variants: [], defaultVariantId: null },
    { variants: item.variants.map((v) => ({ ...v, overrides: [] })) },
    { defaultVariantId: randomUUID() },
    { basePriceMinor: null },
    { thumbnailAssetId: null },
  ];
  for (const change of checks)
    expect(c.readiness({ ...item, ...change }).publishable).toBe(false);
  expect(() => c.saveItem({ defaultVariantId: draft().id }, item.id)).toThrow(
    "does not belong",
  );
  c.saveItem({ status: "ACTIVE" }, item.id);
  expect(c.list({}, false).total).toBe(1);
});
it("chooses first active color atomically, replaces deactivated defaults, and clears the last draft default", async () => {
  let item = await ready();
  const blue = item.colors[0];
  c.saveColor(item.id, { status: "INACTIVE" }, blue.id);
  expect(c.get(item.id).defaultVariantId).toBeNull();
  item = c.saveColor(item.id, {
    name: "Hidden",
    status: "INACTIVE",
    baseColor: "#ffffff",
  });
  expect(item.defaultVariantId).toBeNull();
  item = c.saveColor(item.id, {
    name: "Green",
    status: "ACTIVE",
    baseColor: "#00ff00",
  });
  const green = item.colors.find((v) => v.name === "Green")!;
  expect(item.defaultVariantId).toBe(green.id);
  c.saveColor(item.id, { status: "ACTIVE" }, blue.id);
  item = c.saveColor(item.id, { status: "INACTIVE" }, green.id);
  expect(item.defaultVariantId).toBe(blue.id);
  c.saveItem({ status: "ACTIVE" }, item.id);
  expect(() => c.saveColor(item.id, { status: "INACTIVE" }, blue.id)).toThrow(
    "setup requirements",
  );
  expect(c.get(item.id).defaultVariantId).toBe(blue.id);
  expect(c.get(item.id).colors.find((v) => v.id === blue.id)?.status).toBe(
    "ACTIVE",
  );
});
it("keeps omitted PATCH values and rejects duplicate creation without leaving material records", async () => {
  let item = await ready();
  const blue = item.colors[0];
  c.saveColor(
    item.id,
    { sku: "BLUE", priceMinor: 123, currency: "USD", status: "INACTIVE" },
    blue.id,
  );
  item = c.saveColor(item.id, { name: "Renamed" }, blue.id);
  const updated = item.colors[0];
  expect(updated).toMatchObject({
    sku: "BLUE",
    priceOverrideMinor: 123,
    currencyOverride: "USD",
    status: "INACTIVE",
  });
  expect(updated.overrides).toEqual(blue.overrides);
  const materials = item.materials.length;
  expect(() =>
    c.saveColor(item.id, {
      name: "Renamed",
      baseColor: "#ff0000",
      status: "ACTIVE",
    }),
  ).toThrow("already exists");
  expect(c.get(item.id).colors).toHaveLength(1);
  expect(c.get(item.id).materials).toHaveLength(materials);
});
it("attaches uploads atomically and cleans files if Item update fails", async () => {
  const item = draft();
  connection.sqlite.exec(
    "CREATE TRIGGER fail_attach BEFORE UPDATE ON items BEGIN SELECT RAISE(ABORT,'attachment failed'); END;",
  );
  await expect(model(item.id)).rejects.toThrow("attachment failed");
  expect(c.get(item.id).assets).toHaveLength(0);
  expect(c.get(item.id).baseModelAssetId).toBeNull();
  expect(readdirSync(join(root, `items/${item.id}/models`))).toHaveLength(0);
  connection.sqlite.exec("DROP TRIGGER fail_attach");
  const id = await model(item.id);
  expect(c.get(item.id).baseModelAssetId).toBe(id);
  await expect(model(item.id)).rejects.toThrow("already has a model");
  expect(c.get(item.id).assets).toHaveLength(1);
});
it("replaces unused geometry atomically, keeps colors, and resumes dimensions", async () => {
  const item = await ready(),
    old = item.baseModelAssetId;
  const bytes = testGLB();
  const id = a.register(
    item.id,
    "GLB_MODEL",
    "replacement.glb",
    "model/gltf-binary",
    bytes,
    await inspectGLB(bytes),
    true,
  );
  const result = c.get(item.id);
  expect(id).not.toBe(old);
  expect(result.assets.filter((v) => v.type === "GLB_MODEL")).toHaveLength(1);
  expect(result.dimensions).toBeNull();
  expect(result.bindings).toHaveLength(0);
  expect(result.colors[0].overrides).toEqual(item.colors[0].overrides);
  expect(result.setup?.nextRequiredStep).toBe("DIMENSIONS");
  expect(result.status).toBe("DRAFT");
  expect(connection.sqlite.pragma("foreign_key_check")).toEqual([]);
  c.calibrate(
    item.id,
    id,
    verifiedDimensions({
      width: 2.4,
      depth: 0.95,
      height: 0.82,
      orientation: 0,
      confirmed: true,
    }),
    dimensionAdmin(c.db),
  );
  expect(c.get(item.id).setup?.nextRequiredStep).toBe("COLOR_TARGETS");
});
it("retains the old model and all mappings when replacement fails", async () => {
  const item = await ready();
  connection.sqlite.exec(
    "CREATE TRIGGER fail_replace BEFORE UPDATE ON items BEGIN SELECT RAISE(ABORT,'replace failed'); END;",
  );
  const bytes = testGLB();
  expect(() =>
    a.register(
      item.id,
      "GLB_MODEL",
      "replacement.glb",
      "model/gltf-binary",
      bytes,
      null,
      true,
    ),
  ).toThrow("replace failed");
  expect(c.get(item.id)).toEqual(item);
  expect(readdirSync(join(root, `items/${item.id}/models`))).toHaveLength(1);
});
it("does not treat old scale calibration as confirmed product dimensions", async () => {
  const item = draft(),
    id = await model(item.id);
  connection.sqlite
    .prepare("UPDATE item_assets SET calibration_json=? WHERE id=?")
    .run(
      JSON.stringify({
        metresPerModelUnit: 80,
        orientation: 90,
        confirmed: true,
      }),
      id,
    );
  expect(c.get(item.id).setup).toMatchObject({
    modelUploaded: true,
    modelValid: true,
    dimensionsConfirmed: false,
    nextRequiredStep: "DIMENSIONS",
  });
});
it("normalizes form values and converts money without rounding or blank-to-zero errors", () => {
  expect(optionalId(" ")).toBeNull();
  expect(optionalString(" SKU ")).toBe("SKU");
  expect(optionalNumber("")).toBeNull();
  expect(() => optionalNumber("Infinity")).toThrow();
  expect(moneyInput("6,900.50", "ils")).toBe(690050);
  expect(moneyInput(" ", "ILS")).toBeNull();
  expect(() => moneyInput("no", "ILS")).toThrow();
  expect(() => moneyInput("1.005", "ILS")).toThrow();
  expect(
    normalizeCatalogForm({
      defaultVariantId: "",
      overrides: [{ materialId: "", slotId: "" }],
    }),
  ).toEqual({
    defaultVariantId: null,
    overrides: [{ materialId: null, slotId: "" }],
  });
});
