import { verifiedDimensions, dimensionAdmin } from "./dimension-fixture";
import { beforeEach, afterEach, it, expect } from "vitest";
import { mkdtempSync, rmSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import sharp from "../server/node_modules/sharp";
import request from "supertest";
import { createApp } from "../server/src/app";
import { CatalogService } from "../server/src/modules/items/service";
import { inspectGLB } from "../server/src/modules/items/glb";
import { testGLB } from "./glb-fixture";
import { testPassword } from "./auth-helper";
let root: string, a: ReturnType<typeof createApp>, c: CatalogService;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "thumbnail-test-"));
  a = createApp(join(root, "test.sqlite"), join(root, "storage"), false);
  c = new CatalogService(a.repo.db.sqlite);
  a.repo.db.sqlite
    .prepare("INSERT INTO brands VALUES('brand','Brand',1)")
    .run();
});
afterEach(() => {
  a.close();
  rmSync(root, { recursive: true, force: true });
});
async function calibrated() {
  let item = c.saveItem({ name: "Sofa", brandId: "brand", categoryId: "sofa" });
  const bytes = testGLB();
  const model = a.assets.register(
    item.id,
    "GLB_MODEL",
    "sofa.glb",
    "model/gltf-binary",
    bytes,
    await inspectGLB(bytes),
  );
  item = c.calibrate(
    item.id,
    model,
    verifiedDimensions({
      width: 2.4,
      depth: 0.95,
      height: 0.82,
      orientation: 0,
      confirmed: true,
    }),
    dimensionAdmin(c.db),
  );
  return item;
}
const image = () =>
  sharp({
    create: { width: 512, height: 512, channels: 3, background: "white" },
  })
    .webp()
    .toBuffer();
it("tracks render-only changes, saves source metadata and replaces immutable images safely", async () => {
  let item = await calibrated();
  const signature = item.thumbnailGeneration!.signature!;
  const bytes = await image();
  item = await a.assets.generatedThumbnail(item.id, bytes, signature, null);
  const first = item.thumbnailAssetId!;
  expect(item.thumbnailGeneration?.current).toBe(true);
  expect(item.setup?.thumbnailReady).toBe(true);
  expect(item.assets.find((v) => v.id === first)?.generated).toMatchObject({
    source: "GENERATED_FROM_GLB",
    modelAssetId: item.baseModelAssetId,
    defaultColorId: null,
    width: 512,
    height: 512,
  });
  item = c.saveItem(
    {
      name: "Renamed",
      description: "New copy",
      itemCode: "SKU",
      basePriceMinor: 50,
    },
    item.id,
  );
  expect(item.thumbnailGeneration?.signature).toBe(signature);
  item = c.colorTargets(item.id, {
    targets: [{ materialIndex: 0, nodeIndex: 0 }],
  });
  expect(item.thumbnailGeneration?.signature).not.toBe(signature);
  const mapped = item.thumbnailGeneration!.signature!;
  item = c.saveColor(item.id, {
    name: "Blue",
    baseColor: "#0000ff",
    status: "ACTIVE",
  });
  const blue = item.defaultVariantId!;
  expect(item.thumbnailGeneration?.signature).not.toBe(mapped);
  const blueSignature = item.thumbnailGeneration!.signature!;
  item = c.saveColor(item.id, {
    name: "White",
    baseColor: "#ffffff",
    status: "ACTIVE",
  });
  expect(item.thumbnailGeneration?.signature).toBe(blueSignature);
  item = c.saveColor(
    item.id,
    { sku: "BLUE", priceMinor: 300, name: "Blue renamed" },
    blue,
  );
  expect(item.thumbnailGeneration?.signature).toBe(blueSignature);
  item = c.saveColor(item.id, { baseColor: "#0011ff" }, blue);
  expect(item.thumbnailGeneration?.signature).not.toBe(blueSignature);
  item = await a.assets.generatedThumbnail(
    item.id,
    bytes,
    item.thumbnailGeneration!.signature!,
    first,
  );
  expect(item.thumbnailAssetId).not.toBe(first);
  expect(item.assets.some((v) => v.id === first)).toBe(false);
  expect(
    readdirSync(join(root, `storage/items/${item.id}/thumbnails`)),
  ).toHaveLength(1);
  const old = item.thumbnailAssetId;
  item = c.saveItem(
    { defaultVariantId: item.colors.find((v) => v.id !== blue)!.id },
    item.id,
  );
  expect(item.thumbnailGeneration?.current).toBe(false);
  expect(item.thumbnailAssetId).toBe(old);
  const whiteSignature = item.thumbnailGeneration!.signature;
  item = c.calibrate(
    item.id,
    item.baseModelAssetId!,
    verifiedDimensions({
      width: 0.95,
      depth: 2.4,
      height: 0.82,
      orientation: 90,
      confirmed: true,
    }),
    dimensionAdmin(c.db),
  );
  expect(item.thumbnailGeneration?.signature).not.toBe(whiteSignature);
  expect(a.repo.db.sqlite.pragma("foreign_key_check")).toEqual([]);
});
it("rejects stale snapshots and decode/resolution failures while retaining the previous image", async () => {
  let item = await calibrated();
  const bytes = await image();
  item = await a.assets.generatedThumbnail(
    item.id,
    bytes,
    item.thumbnailGeneration!.signature!,
    null,
  );
  const before = item;
  await expect(
    a.assets.generatedThumbnail(
      item.id,
      Buffer.from("not image"),
      item.thumbnailGeneration!.signature!,
      item.thumbnailAssetId,
    ),
  ).rejects.toThrow();
  const small = await sharp({
    create: { width: 20, height: 20, channels: 3, background: "white" },
  })
    .png()
    .toBuffer();
  await expect(
    a.assets.generatedThumbnail(
      item.id,
      small,
      item.thumbnailGeneration!.signature!,
      item.thumbnailAssetId,
    ),
  ).rejects.toThrow("512");
  await expect(
    a.assets.generatedThumbnail(
      item.id,
      bytes,
      "0".repeat(64),
      item.thumbnailAssetId,
    ),
  ).rejects.toThrow("changed");
  await expect(
    a.assets.generatedThumbnail(
      item.id,
      bytes,
      item.thumbnailGeneration!.signature!,
      null,
    ),
  ).rejects.toThrow("changed");
  a.repo.db.sqlite.exec(
    "CREATE TRIGGER fail_thumbnail BEFORE UPDATE ON items BEGIN SELECT RAISE(ABORT,'attachment failed'); END;",
  );
  await expect(
    a.assets.generatedThumbnail(
      item.id,
      bytes,
      item.thumbnailGeneration!.signature!,
      item.thumbnailAssetId,
    ),
  ).rejects.toThrow("attachment failed");
  expect(c.get(item.id)).toEqual(before);
  expect(
    readdirSync(join(root, `storage/items/${item.id}/thumbnails`)),
  ).toHaveLength(1);
  expect(a.repo.db.sqlite.pragma("foreign_key_check")).toEqual([]);
});
it("retains manual images and generated images still referenced by a color", async () => {
  let item = await calibrated();
  const bytes = await image();
  const manual = a.assets.register(
    item.id,
    "THUMBNAIL",
    "manual.webp",
    "image/webp",
    bytes,
  );
  item = await a.assets.generatedThumbnail(
    item.id,
    bytes,
    item.thumbnailGeneration!.signature!,
    manual,
  );
  expect(item.assets.some((v) => v.id === manual)).toBe(true);
  const generated = item.thumbnailAssetId!;
  c.colorTargets(item.id, { targets: [{ materialIndex: 0, nodeIndex: 0 }] });
  item = c.saveColor(item.id, {
    name: "Blue",
    status: "ACTIVE",
    baseColor: "#0000ff",
    thumbnailAssetId: generated,
  });
  item = await a.assets.generatedThumbnail(
    item.id,
    bytes,
    item.thumbnailGeneration!.signature!,
    generated,
  );
  expect(item.assets.some((v) => v.id === generated)).toBe(true);
});
it("requires confirmed dimensions and exposes an admin-only validated endpoint", async () => {
  await a.auth.bootstrap({
    email: "admin@thumb.test",
    name: "Admin",
    password: testPassword,
  });
  await a.auth.createUser({
    email: "user@thumb.test",
    name: "User",
    password: testPassword,
    role: "USER",
  });
  const admin = request.agent(a.app).set("X-Habitat-Request", "1"),
    user = request.agent(a.app).set("X-Habitat-Request", "1");
  await admin
    .post("/api/auth/login")
    .send({ email: "admin@thumb.test", password: testPassword });
  await user
    .post("/api/auth/login")
    .send({ email: "user@thumb.test", password: testPassword });
  const item = await calibrated(),
    path = `/api/admin/items/${item.id}/generated-thumbnail`,
    bytes = await image();
  await user
    .post(path)
    .set("Content-Type", "image/webp")
    .send(bytes)
    .expect(403);
  await admin
    .post(path)
    .set("Content-Type", "image/webp")
    .set("X-Thumbnail-Signature", item.thumbnailGeneration!.signature!)
    .set("X-Thumbnail-Previous", "none")
    .send(Buffer.from("invalid"))
    .expect(400);
  const result = await admin
    .post(path)
    .set("Content-Type", "image/webp")
    .set("X-Thumbnail-Signature", item.thumbnailGeneration!.signature!)
    .set("X-Thumbnail-Previous", "none")
    .send(bytes)
    .expect(201);
  expect(result.body.thumbnailGeneration.current).toBe(true);
  const draft = c.saveItem({
    name: "Old draft",
    brandId: "brand",
    categoryId: "sofa",
  });
  expect(draft.thumbnailGeneration?.signature).toBeNull();
  await expect(
    a.assets.generatedThumbnail(draft.id, bytes, "0".repeat(64), null),
  ).rejects.toThrow("dimensions");
});
